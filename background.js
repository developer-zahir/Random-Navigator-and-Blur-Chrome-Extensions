// background.js - MV3 Compatible (chrome.alarms for SW-safe timers)
let activeTasks = {};

const ALARM_PREFIX = 'pagepilot_';
const DEFAULT_BLUR = { classes: "user-balance, balance", amount: 4 };

// === UTILITY ===
function extractDomain(url) {
    try {
        if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return null;
        const hostname = new URL(url).hostname;
        return hostname.startsWith("www.") ? hostname.substring(4) : hostname;
    } catch (e) {
        return null;
    }
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getAlarmName(tabId) {
    return `${ALARM_PREFIX}${tabId}`;
}

// === TASK RESTORATION (SW restart recovery) ===
function restoreTasksFromStorage() {
    chrome.storage.local.get(["activeTasks"], (data) => {
        const tasks = data.activeTasks || {};
        const restored = {};

        Object.keys(tasks).forEach(tabIdStr => {
            const tabId = parseInt(tabIdStr);
            const taskData = tasks[tabIdStr];
            const settings = taskData?.currentSettings;
            if (!settings) return;

            chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError || !tab) {
                    chrome.alarms.clear(getAlarmName(tabId));
                    return;
                }
                handleReloaderLoop(tabId, settings);
            });

            restored[tabIdStr] = taskData;
        });

        activeTasks = restored;
    });
}

// === BLUR ===
function sendBlurMessage(tabId, classes, amount) {
    const classesArray = (classes || DEFAULT_BLUR.classes)
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);

    if (!tabId || classesArray.length === 0) return;

    chrome.tabs.sendMessage(tabId, {
        action: "applyBlur",
        classes: classesArray,
        amount: parseInt(amount),
    }).catch(err => {
        if (!err.message.includes("Receiving end does not exist")) {
            console.error("[Background] Blur message error:", err);
        }
    });
}

// === BADGE COUNTDOWN (cosmetic, setInterval OK) ===
function startBadgeCountdown(tabId, delayInSeconds) {
    let timeLeft = delayInSeconds;
    const task = activeTasks[String(tabId)];
    if (task?.intervalId) clearInterval(task.intervalId);

    const intervalId = setInterval(() => {
        if (timeLeft >= 0) {
            chrome.action.setBadgeText({ tabId, text: String(timeLeft) });
            chrome.action.setBadgeBackgroundColor({ tabId, color: "#DC143C" });
            timeLeft--;
        } else {
            clearInterval(intervalId);
            chrome.action.setBadgeText({ tabId, text: "GO!" });
            chrome.action.setBadgeBackgroundColor({ tabId, color: "#32CD32" });
        }
    }, 1000);
    return intervalId;
}

// === MAIN RELOADER LOOP ===
function handleReloaderLoop(tabId, settings) {
    const tabIdStr = String(tabId);
    let task = activeTasks[tabIdStr];

    if (!task) {
        task = {
            currentSettings: settings,
            currentUrlIndex: -1,
            currentReloadCount: 0,
            randomMaxReloads: 0,
            pendingAction: null,
            pendingUrl: null,
            intervalId: null,
        };
        activeTasks[tabIdStr] = task;
    } else {
        task.currentSettings = settings;
        chrome.alarms.clear(getAlarmName(tabId));
        if (task.intervalId) clearInterval(task.intervalId);
    }

    const urlList = settings.urlList;
    if (!urlList || urlList.length === 0) {
        stopReloader(tabId);
        return;
    }

    const isReloadLimitReached = task.currentReloadCount >= task.randomMaxReloads;
    let nextUrl, actionType;

    if (settings.navigateOnly || isReloadLimitReached || task.currentUrlIndex === -1) {
        let randomIndex;
        do {
            randomIndex = getRandomInt(0, urlList.length - 1);
        } while (urlList.length > 1 && randomIndex === task.currentUrlIndex);

        task.currentUrlIndex = randomIndex;
        nextUrl = urlList[task.currentUrlIndex];
        actionType = "navigate";

        console.log(`%c[Navigate] নতুন পেজে যাচ্ছি: ${nextUrl}`, 'color: #00bfff; font-weight: bold;');
    } else {
        nextUrl = urlList[task.currentUrlIndex];
        actionType = "reload";

        console.log(`%c[Reload] পেজ রিলোড (${task.currentReloadCount + 1}/${task.randomMaxReloads})`, 'color: #ffa500; font-weight: bold;');
    }

    chrome.storage.local.set({ activeTasks });

    const randomDelay = getRandomInt(settings.minSec, settings.maxSec);
    task.intervalId = startBadgeCountdown(tabId, randomDelay);
    task.pendingAction = actionType;
    task.pendingUrl = nextUrl;

    // chrome.alarms — survives service worker restart
    chrome.alarms.create(getAlarmName(tabId), {
        delayInMinutes: randomDelay / 60
    });
}

function stopReloader(tabId) {
    const tabIdStr = String(tabId);
    if (activeTasks[tabIdStr]) {
        if (activeTasks[tabIdStr].intervalId) clearInterval(activeTasks[tabIdStr].intervalId);
        chrome.alarms.clear(getAlarmName(tabId));
        chrome.action.setBadgeText({ tabId, text: "" });
        delete activeTasks[tabIdStr];
        chrome.storage.local.set({ activeTasks });
    }
}

// === ALARM HANDLER (uses action stored by handleReloaderLoop) ===
chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm.name.startsWith(ALARM_PREFIX)) return;

    const tabId = parseInt(alarm.name.substring(ALARM_PREFIX.length));
    const tabIdStr = String(tabId);
    const task = activeTasks[tabIdStr];

    if (!task || !task.pendingAction) {
        console.warn(`[Background] Alarm fired but no pending action for tab ${tabId}`);
        return;
    }

    const actionType = task.pendingAction;
    const nextUrl = task.pendingUrl;
    const settings = task.currentSettings;

    task.pendingAction = null;
    task.pendingUrl = null;

    const urlList = settings.urlList;
    if (!urlList || urlList.length === 0) {
        stopReloader(tabId);
        return;
    }

    if (actionType === "reload") {
        console.log(`%c[Reload] পেজ রিলোড (${task.currentReloadCount + 1}/${task.randomMaxReloads})`, 'color: #ffa500; font-weight: bold;');

        chrome.tabs.reload(tabId, {}, () => {
            if (chrome.runtime.lastError) {
                console.error(`[Background] Reload failed: ${chrome.runtime.lastError.message}`);
                stopReloader(tabId);
                return;
            }
            task.currentReloadCount++;
            chrome.storage.local.set({ activeTasks });
            console.log(`%c[Reload Done] Count: ${task.currentReloadCount}/${task.randomMaxReloads}`, 'color: #32cd32; font-weight: bold;');
            handleReloaderLoop(tabId, settings);
        });
    } else {
        console.log(`%c[Navigate] নতুন পেজে যাচ্ছি: ${nextUrl}`, 'color: #00bfff; font-weight: bold;');

        chrome.tabs.update(tabId, { url: nextUrl }, () => {
            if (chrome.runtime.lastError) {
                console.error(`[Background] Navigate failed: ${chrome.runtime.lastError.message}`);
                stopReloader(tabId);
                return;
            }
            const minR = settings.minReloadCount;
            const maxR = settings.maxReloadCount;
            task.randomMaxReloads = settings.navigateOnly ? 0 : getRandomInt(minR, maxR);
            task.currentReloadCount = 0;
            chrome.storage.local.set({ activeTasks });
            console.log(`%c[Navigate Done] Max Reload: ${task.randomMaxReloads}`, 'color: #32cd32; font-weight: bold;');
            handleReloaderLoop(tabId, settings);
        });
    }
});

// === TAB EVENTS ===
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.url || tab.url.startsWith("chrome")) return;

    const domain = extractDomain(tab.url);
    if (!domain) return;

    const blurStorageKey = `${domain}_blur_settings`;
    chrome.storage.local.get(["activeTasks", blurStorageKey], (data) => {
        const tasks = data.activeTasks || {};
        const isRunning = !!tasks[String(tabId)];
        const blurSettings = data[blurStorageKey] || DEFAULT_BLUR;
        const amountToSend = isRunning ? (blurSettings.amount || DEFAULT_BLUR.amount) : 0;
        sendBlurMessage(tabId, blurSettings.classes, amountToSend);
    });
});

// === MESSAGE LISTENER ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getTasks") {
        sendResponse(activeTasks);
        return true;
    }

    if (request.action === "requestBlurSettings" && request.url) {
        const domain = extractDomain(request.url);
        if (!domain) return true;

        const blurStorageKey = `${domain}_blur_settings`;
        chrome.storage.local.get(["activeTasks", blurStorageKey], (data) => {
            const blurSettings = data[blurStorageKey] || DEFAULT_BLUR;
            const tasks = data.activeTasks || {};
            const tabId = sender.tab?.id;

            if (tabId) {
                const isRunning = !!tasks[String(tabId)];
                const amountToSend = isRunning ? (blurSettings.amount || DEFAULT_BLUR.amount) : 0;
                sendBlurMessage(tabId, blurSettings.classes, amountToSend);
            }
        });
        return true;
    }

    if (!request.settings?.tabId) return true;

    const tabId = request.settings.tabId;
    if (request.action === "startReloader") {
        handleReloaderLoop(tabId, request.settings);
    } else if (request.action === "stopReloader") {
        stopReloader(tabId);
    }

    return true;
});

// === EXTENSION LIFECYCLE ===
chrome.runtime.onInstalled.addListener(() => {
    restoreTasksFromStorage();
});

chrome.tabs.onRemoved.addListener((tabId) => {
    stopReloader(tabId);
});

// === STARTUP: Restore tasks on SW initialization ===
restoreTasksFromStorage();
