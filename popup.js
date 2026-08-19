// popup.js - FIXED: Duplicate task list rendering issue
document.addEventListener("DOMContentLoaded", function () {
    // --- UI Elements ---
    const minSecInput = document.getElementById("minSec");
    const maxSecInput = document.getElementById("maxSec");
    const minReloadCountInput = document.getElementById("minReloadCount");
    const maxReloadCountInput = document.getElementById("maxReloadCount");
    const navigateOnlyCheckbox = document.getElementById("navigateOnly");

    const urlListInput = document.getElementById("urlList");
    const startStopButton = document.getElementById("startStop");
    const saveSettingsButton = document.getElementById("saveSettings");
    const resetSettingsButton = document.getElementById("resetSettings");
    const statusText = document.getElementById("status");
    const domainText = document.getElementById("currentDomain");
    const taskList = document.getElementById("activeTasksList");
    const notification = document.getElementById("customNotification");

    const blurClassesInput = document.getElementById("blurClasses");
    const blurAmountInput = document.getElementById("blurAmount");
    const blurValueSpan = document.getElementById("blurValue");
    const saveBlurSettingsButton = document.getElementById("SaveBlurSettings");

    let isRunning = false;
    let currentTabId = null;
    let currentDomain = null;
    let isRenderingTaskList = false; // ✅ Duplicate rendering prevention

    const DEFAULT_SETTINGS = {
        minSec: 60,
        maxSec: 600,
        minReloadCount: 1,
        maxReloadCount: 5,
        navigateOnly: false,
        urlList: "https://www.example.com/page1\nhttps://www.example.com/page2",
    };

    const DEFAULT_BLUR_SETTINGS = {
        classes: "user-balance, balance",
        amount: 4,
    };

    // --- Utility Functions ---
    function extractDomain(url) {
        if (url && (url.startsWith("chrome://") || url.startsWith("chrome-extension://"))) {
            return null;
        }
        try {
            const hostname = new URL(url).hostname;
            return hostname.startsWith("www.") ? hostname.substring(4) : hostname;
        } catch (e) {
            return null;
        }
    }

    function processInput(inputString) {
        return inputString
            .trim()
            .split("\n")
            .map((u) => u.trim())
            .filter((u) => u.length > 0);
    }

    function showCustomNotification(message) {
        notification.textContent = message || "সেটিংস সেভ হয়েছে!";
        notification.classList.add("show");
        setTimeout(() => notification.classList.remove("show"), 3000);
    }

    function updateUI() {
        startStopButton.textContent = isRunning ? "বন্ধ করুন" : "শুরু করুন";
        statusText.textContent = isRunning ? "স্ট্যাটাস: চলছে" : "স্ট্যাটাস: বন্ধ";
        statusText.className = isRunning ? "running" : "stopped";
        startStopButton.classList.toggle("running", isRunning);
    }

    function renderTaskList(tasks) {
        // ✅ Prevent duplicate rendering
        if (isRenderingTaskList) {
            console.log('%c[UI] Task list rendering skipped (already in progress)', 'color: orange;');
            return;
        }
        
        isRenderingTaskList = true;
        
        taskList.innerHTML = "";
        const activeTasksArray = Object.keys(tasks);

        if (activeTasksArray.length === 0) {
            taskList.innerHTML = '<li style="text-align: center; background: #f8d7da82;color: #a82d62;display: block;border: 1px solid #97393d52; font-weight: 600;">কোন সক্রিয় টাস্ক নেই।</li>';
            isRenderingTaskList = false;
            return;
        }

        const renderPromises = activeTasksArray.map((tabIdStr) => {
            return new Promise((resolve) => {
                const tabId = parseInt(tabIdStr);
                const task = tasks[tabIdStr];
                if (!task || !task.currentSettings) {
                    resolve();
                    return;
                }

                chrome.tabs.get(tabId, function (tab) {
                    if (chrome.runtime.lastError || !tab) {
                        resolve();
                        return;
                    }

                    const domain = extractDomain(tab.url) || tab.title;
                    const min = task.currentSettings.minSec;
                    const max = task.currentSettings.maxSec;

                    let reloadStatus;
                    if (task.currentSettings.navigateOnly) {
                        reloadStatus = `সময়: ${min}-${max}s | মোড: শুধু নেভিগেট`;
                    } else {
                        const randomMax = task.randomMaxReloads || 0;
                        const currentReload = task.currentReloadCount || 0;
                        reloadStatus = `সময়: ${min}-${max}s | রিলোড: ${currentReload}/${randomMax}`;
                    }

                    const listItem = document.createElement("li");
                    listItem.setAttribute("data-tab-id", tabId);
                    listItem.innerHTML = `<div><span class="task-domain">${domain}</span><br><span class="task-status">${reloadStatus}</span></div><div class="task-actions"><button id="edit-${tabId}" class="edit-btn">সেটিংস</button><button id="stop-${tabId}" class="stop-btn">বন্ধ করুন</button></div>`;
                    taskList.appendChild(listItem);

                    document.getElementById(`edit-${tabId}`).addEventListener("click", () => {
                        chrome.tabs.update(tabId, { active: true }, () => window.close());
                    });

                    document.getElementById(`stop-${tabId}`).addEventListener("click", () => {
                        chrome.runtime.sendMessage({ action: "stopReloader", settings: { tabId: tabId } });

                        const blurStorageKey = `${domain}_blur_settings`;
                        chrome.storage.local.get([blurStorageKey], (data) => {
                            const blurSettings = data[blurStorageKey] || DEFAULT_BLUR_SETTINGS;
                            const classesArray = blurSettings.classes.split(',').map(c => c.trim()).filter(c => c.length > 0);
                            applyBlurToTab(classesArray, 0, tabId);
                        });
                    });

                    resolve();
                });
            });
        });

        Promise.all(renderPromises).then(() => {
            isRenderingTaskList = false;
            console.log('%c[UI] Task list rendered successfully', 'color: green;');
        }).catch(() => {
            isRenderingTaskList = false;
        });
    }

    function switchTab(tabName) {
        document.querySelectorAll(".tab-button").forEach((btn) => btn.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"));

        let buttonId, contentId;
        if (tabName === "navigator") {
            buttonId = "navigatorTabButton";
            contentId = "navigatorContent";
        } else if (tabName === "blurSettings") {
            buttonId = "blurTabButton";
            contentId = "blurSettingsContent";
        } else if (tabName === "taskList") {
            buttonId = "taskListTabButton";
            contentId = "taskListContent";
        } else if (tabName === "history") {
            buttonId = "historyTabButton";
            contentId = "historyContent";
        }

        const button = document.getElementById(buttonId);
        const content = document.getElementById(contentId);

        if (button) button.classList.add("active");
        if (content) content.classList.add("active");

        if (tabName === "taskList") {
            chrome.runtime.sendMessage({ action: "getTasks" }, renderTaskList);
        }
        if (tabName === "history") {
            loadHistory();
        }
    }

    function applyBlurToTab(classesArray, amount, tabId) {
        if (!tabId || classesArray.length === 0) return;

        chrome.tabs.sendMessage(tabId, {
            action: "applyBlur",
            classes: classesArray,
            amount: parseInt(amount),
        }).catch(err => {
            if (!err.message.includes("Receiving end does not exist")) {
                console.error("Blur send error:", err);
            }
        });
    }

    // === HISTORY & STATISTICS ===
    function formatTime(ts) {
        const d = new Date(ts);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'এইমাত্র';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}মি আগে`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}ঘ আগে`;
        return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' });
    }

    function renderStats(history) {
        const navigates = history.filter(e => e.action === 'navigate').length;
        const reloads = history.filter(e => e.action === 'reload').length;
        const domains = new Set(history.map(e => e.domain)).size;

        document.getElementById('statTotal').textContent = history.length;
        document.getElementById('statNavigate').textContent = navigates;
        document.getElementById('statReload').textContent = reloads;
        document.getElementById('statDomains').textContent = domains;
    }

    function renderHistory(history) {
        const list = document.getElementById('historyList');
        list.innerHTML = '';

        if (!history || history.length === 0) {
            list.innerHTML = '<li class="history-empty">কোন ইতিহাস নেই।</li>';
            return;
        }

        history.slice(0, 50).forEach(event => {
            const li = document.createElement('li');
            const actionLabel = event.action === 'navigate' ? 'নেভিগেট' : 'রিলোড';
            const badgeClass = event.action === 'navigate' ? 'navigate' : 'reload';
            const shortUrl = event.url ? event.url.replace(/^https?:\/\//, '').substring(0, 30) : '';

            li.innerHTML = `
                <div class="history-info">
                    <span class="history-domain">${event.domain}</span>
                    <span class="history-detail">${shortUrl}${shortUrl.length >= 30 ? '...' : ''}</span>
                </div>
                <span class="history-badge ${badgeClass}">${actionLabel}</span>
                <span class="history-time">${formatTime(event.timestamp)}</span>
            `;
            list.appendChild(li);
        });
    }

    function loadHistory() {
        chrome.runtime.sendMessage({ action: "getHistory" }, (history) => {
            renderStats(history);
            renderHistory(history);
        });
    }

    // === EXPORT / IMPORT ===
    function exportSettings() {
        chrome.runtime.sendMessage({ action: "exportSettings" }, (data) => {
            if (!data) return;
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pagepilot-settings-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showCustomNotification("সেটিংস এক্সপোর্ট হয়েছে!");
        });
    }

    function importSettings(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                chrome.runtime.sendMessage({ action: "importSettings", data: data }, (response) => {
                    if (response?.status === 'imported') {
                        showCustomNotification("সেটিংস ইম্পোর্ট হয়েছে! রিলোড করুন।");
                        setTimeout(() => location.reload(), 1500);
                    }
                });
            } catch (err) {
                showCustomNotification("ত্রুটি: সঠিক JSON ফাইল দিন।");
            }
        };
        reader.readAsText(file);
    }

    // ✅ Real-time UI update with debouncing
    let taskUpdateTimeout = null;
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;

        if (changes.activeTasks) {
            const newTasks = changes.activeTasks.newValue || {};
            
            // ✅ Only update task list if it's currently visible
            if (document.getElementById("taskListContent") && 
                document.getElementById("taskListContent").classList.contains("active")) {
                
                // ✅ Debounce: Wait 100ms before rendering to avoid duplicates
                clearTimeout(taskUpdateTimeout);
                taskUpdateTimeout = setTimeout(() => {
                    renderTaskList(newTasks);
                }, 100);
            }
            
            // Update current tab status
            if (currentTabId) {
                const newIsRunning = !!newTasks[currentTabId];
                if (newIsRunning !== isRunning) {
                    isRunning = newIsRunning;
                    updateUI();
                }
            }
        }

        if (currentDomain && changes[`${currentDomain}_blur_settings`]) {
            const newVal = changes[`${currentDomain}_blur_settings`].newValue;
            if (newVal) {
                blurClassesInput.value = newVal.classes || DEFAULT_BLUR_SETTINGS.classes;
                blurAmountInput.value = newVal.amount || DEFAULT_BLUR_SETTINGS.amount;
                blurValueSpan.textContent = newVal.amount || DEFAULT_BLUR_SETTINGS.amount;
            }
        }

        if (currentDomain && changes[`${currentDomain}_settings`]) {
            const newVal = changes[`${currentDomain}_settings`].newValue;
            if (newVal) {
                minSecInput.value = newVal.minSec || DEFAULT_SETTINGS.minSec;
                maxSecInput.value = newVal.maxSec || DEFAULT_SETTINGS.maxSec;
                minReloadCountInput.value = newVal.minReloadCount || DEFAULT_SETTINGS.minReloadCount;
                maxReloadCountInput.value = newVal.maxReloadCount || DEFAULT_SETTINGS.maxReloadCount;
                navigateOnlyCheckbox.checked = newVal.navigateOnly || DEFAULT_SETTINGS.navigateOnly;
                urlListInput.value = newVal.urlList || DEFAULT_SETTINGS.urlList;
            }
        }
    });

    // --- সেটিংস লোড ---
    function loadSettings() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length === 0) return;
            const tab = tabs[0];
            const domain = extractDomain(tab.url);

            currentTabId = tab.id;

            if (!domain) {
                domainText.textContent = "ডোমেন: এক্সটেনশন পেজে সক্রিয় করা যাবে না";
                [startStopButton, saveSettingsButton, resetSettingsButton, saveBlurSettingsButton].forEach(btn => btn.disabled = true);
                return;
            }

            currentDomain = domain;
            domainText.textContent = `ডোমেন: ${domain}`;
            [startStopButton, saveSettingsButton, resetSettingsButton, saveBlurSettingsButton].forEach(btn => btn.disabled = false);

            const domainStorageKey = `${domain}_settings`;
            const blurStorageKey = `${domain}_blur_settings`;

            chrome.storage.local.get([domainStorageKey, blurStorageKey, "activeTasks"], function (data) {
                const domainSettings = data[domainStorageKey] || DEFAULT_SETTINGS;
                minSecInput.value = domainSettings.minSec;
                maxSecInput.value = domainSettings.maxSec;
                minReloadCountInput.value = domainSettings.minReloadCount;
                maxReloadCountInput.value = domainSettings.maxReloadCount;
                navigateOnlyCheckbox.checked = domainSettings.navigateOnly;
                urlListInput.value = domainSettings.urlList || DEFAULT_SETTINGS.urlList;

                const blurSettings = data[blurStorageKey] || DEFAULT_BLUR_SETTINGS;
                blurClassesInput.value = blurSettings.classes;
                blurAmountInput.value = blurSettings.amount;
                blurValueSpan.textContent = blurSettings.amount;

                const activeTasks = data.activeTasks || {};
                isRunning = !!activeTasks[currentTabId];
                updateUI();

                if (isRunning) {
                    const classesArray = blurSettings.classes.split(',').map(c => c.trim()).filter(c => c.length > 0);
                    applyBlurToTab(classesArray, blurSettings.amount, currentTabId);
                }
            });
        });
    }

    loadSettings();

    // --- ইভেন্ট লিসেনার ---
    document.getElementById("navigatorTabButton").addEventListener("click", () => switchTab("navigator"));
    document.getElementById("blurTabButton").addEventListener("click", () => switchTab("blurSettings"));
    document.getElementById("taskListTabButton").addEventListener("click", () => switchTab("taskList"));
    document.getElementById("historyTabButton").addEventListener("click", () => switchTab("history"));

    document.getElementById("clearHistory").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "clearHistory" }, () => {
            loadHistory();
            showCustomNotification("ইতিহাস মুছে ফেলা হয়েছে!");
        });
    });

    document.getElementById("exportSettings").addEventListener("click", exportSettings);
    document.getElementById("importFile").addEventListener("change", (e) => {
        if (e.target.files[0]) importSettings(e.target.files[0]);
        e.target.value = '';
    });

    blurAmountInput.addEventListener("input", () => {
        blurValueSpan.textContent = blurAmountInput.value;
    });

    saveBlurSettingsButton.addEventListener("click", function () {
        if (!currentDomain) return;

        const classesToSave = blurClassesInput.value.trim() || DEFAULT_BLUR_SETTINGS.classes;
        const amountToSave = parseInt(blurAmountInput.value) || DEFAULT_BLUR_SETTINGS.amount;

        const blurSettings = { classes: classesToSave, amount: amountToSave };
        const blurStorageKey = `${currentDomain}_blur_settings`;

        chrome.storage.local.set({ [blurStorageKey]: blurSettings }, () => {
            showCustomNotification("ব্লার সেটিংস সেভ হয়েছে!");

            if (isRunning) {
                const classesArray = classesToSave.split(',').map(c => c.trim()).filter(c => c.length > 0);
                applyBlurToTab(classesArray, amountToSave, currentTabId);
            }
        });
    });

    saveSettingsButton.addEventListener("click", function () {
        if (!currentDomain) return;

        const minSec = parseInt(minSecInput.value) || DEFAULT_SETTINGS.minSec;
        const maxSec = parseInt(maxSecInput.value) || DEFAULT_SETTINGS.maxSec;
        const minReload = parseInt(minReloadCountInput.value) || DEFAULT_SETTINGS.minReloadCount;
        const maxReload = parseInt(maxReloadCountInput.value) || DEFAULT_SETTINGS.maxReloadCount;

        if (minReload < 0 || maxReload < minReload || minSec < 1 || maxSec < minSec) {
            showCustomNotification("ত্রুটি: ইনপুট সঠিক নয়।");
            return;
        }

        const settings = {
            minSec, maxSec, minReloadCount: minReload, maxReloadCount: maxReload,
            navigateOnly: navigateOnlyCheckbox.checked,
            urlList: urlListInput.value.trim() || DEFAULT_SETTINGS.urlList,
        };

        chrome.storage.local.set({ [`${currentDomain}_settings`]: settings }, () => {
            showCustomNotification("সেটিংস সেভ হয়েছে!");
            if (isRunning) {
                chrome.runtime.sendMessage({
                    action: "startReloader",
                    settings: { tabId: currentTabId, ...settings, urlList: processInput(settings.urlList) }
                });
            }
        });
    });

    resetSettingsButton.addEventListener("dblclick", function () {
        if (!currentDomain) return;

        const storageKeys = [`${currentDomain}_settings`, `${currentDomain}_blur_settings`];
        chrome.storage.local.remove(storageKeys, () => {
            loadSettings();
            showCustomNotification("সমস্ত সেটিংস রিসেট করা হয়েছে!");

            if (isRunning) {
                chrome.runtime.sendMessage({ action: "stopReloader", settings: { tabId: currentTabId } });
            }

            const classesArray = DEFAULT_BLUR_SETTINGS.classes.split(',').map(c => c.trim());
            applyBlurToTab(classesArray, 0, currentTabId);
        });
    });

    startStopButton.addEventListener("click", function () {
        if (!currentTabId || !currentDomain) return;

        const minSec = parseInt(minSecInput.value) || DEFAULT_SETTINGS.minSec;
        const maxSec = parseInt(maxSecInput.value) || DEFAULT_SETTINGS.maxSec;
        const minReload = parseInt(minReloadCountInput.value) || DEFAULT_SETTINGS.minReloadCount;
        const maxReload = parseInt(maxReloadCountInput.value) || DEFAULT_SETTINGS.maxReloadCount;

        if (minReload < 0 || maxReload < minReload || minSec < 1 || maxSec < minSec) {
            showCustomNotification("ত্রুটি: ইনপুট সঠিক নয়।");
            return;
        }

        isRunning = !isRunning;
        updateUI();

        const settingsToSend = {
            tabId: currentTabId,
            minSec, maxSec, minReloadCount: minReload, maxReloadCount: maxReload,
            navigateOnly: navigateOnlyCheckbox.checked,
            urlList: processInput(urlListInput.value || DEFAULT_SETTINGS.urlList),
        };

        chrome.runtime.sendMessage({
            action: isRunning ? "startReloader" : "stopReloader",
            settings: settingsToSend
        });

        const blurStorageKey = `${currentDomain}_blur_settings`;
        chrome.storage.local.get([blurStorageKey], (data) => {
            const blurSettings = data[blurStorageKey] || DEFAULT_BLUR_SETTINGS;
            const classesArray = blurSettings.classes.split(',').map(c => c.trim()).filter(c => c.length > 0);
            const amountToApply = isRunning ? blurSettings.amount : 0;
            applyBlurToTab(classesArray, amountToApply, currentTabId);
        });
    });
});