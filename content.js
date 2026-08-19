// content.js - MV3 Compatible (optimized MutationObserver)
let currentSelector = '';
let currentAmount = 0;
let observer = null;
let periodicInterval = null;

const STYLE_ID = 'pagepilot-blur-style';
const CSS_TEMPLATE = (amount) => `
    .sensitive-blur {
        filter: blur(${amount}px) !important;
        -webkit-filter: blur(${amount}px) !important;
        transition: filter 0.3s ease !important;
        position: relative !important;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
    }
    .sensitive-blur:hover {
        filter: none !important;
        -webkit-filter: none !important;
    }
`;

// === STYLE INJECTION (shadow DOM aware) ===
function injectStyleIntoRoot(root, amount) {
    if (!root) return;
    let style = root.getElementById ? root.getElementById(STYLE_ID) : null;
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        (root.head || root.body || root.documentElement || root).appendChild(style);
    }
    style.textContent = amount > 0 ? CSS_TEMPLATE(amount) : '';
}

function pierceAndInjectStyle(root = document, amount) {
    injectStyleIntoRoot(root, amount);
    root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) pierceAndInjectStyle(el.shadowRoot, amount);
    });
}

function pierceAndAddClass(root = document) {
    if (!currentSelector || currentAmount <= 0) return;
    try {
        root.querySelectorAll(currentSelector).forEach(el => el.classList.add('sensitive-blur'));
    } catch (e) {}
    root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) pierceAndAddClass(el.shadowRoot);
    });
}

function pierceAndRemoveClass(root = document) {
    try {
        root.querySelectorAll('.sensitive-blur').forEach(el => el.classList.remove('sensitive-blur'));
    } catch (e) {}
    root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) pierceAndRemoveClass(el.shadowRoot);
    });
}

// Monkey patch attachShadow for dynamic shadow roots
if (!Element.prototype._originalAttachShadow) {
    Element.prototype._originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (...args) {
        const shadowRoot = this._originalAttachShadow.apply(this, args);
        if (currentAmount > 0 && currentSelector) {
            injectStyleIntoRoot(shadowRoot, currentAmount);
            pierceAndAddClass(shadowRoot);
        }
        return shadowRoot;
    };
}

// === OPTIMIZED OBSERVER (only process addedNodes) ===
function setupObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
        if (currentAmount <= 0 || !currentSelector) return;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                try {
                    if (node.matches && node.matches(currentSelector)) {
                        node.classList.add('sensitive-blur');
                    }
                    node.querySelectorAll?.(currentSelector).forEach(el => el.classList.add('sensitive-blur'));
                } catch (e) {}
                if (node.shadowRoot) pierceAndAddClass(node.shadowRoot);
            }
        }
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true });
}

function startPeriodicCheck() {
    if (periodicInterval) clearInterval(periodicInterval);
    periodicInterval = setInterval(() => {
        if (currentAmount > 0 && currentSelector) pierceAndAddClass(document);
    }, 3000);
}

// === BLUR CONTROL ===
function applyBlur(classes, amount) {
    amount = parseInt(amount) || 0;

    let classesArray = [];
    if (Array.isArray(classes)) {
        classesArray = classes.filter(c => c && c.trim().length > 0);
    } else if (typeof classes === 'string' && classes.trim()) {
        classesArray = classes.split(',').map(c => c.trim()).filter(c => c.length > 0);
    }

    // Smart selector: supports .class, .class1.class2, #id, [attr], tag.class etc.
    const selector = classesArray.map(c => {
        if (!c) return null;
        if (c[0] === '.' || c[0] === '#' || c[0] === '[') return c;
        return `.${c.replace(/([.\\])/g, '\\$1')}`;
    }).filter(Boolean).join(', ');

    if (selector === currentSelector && amount === currentAmount) return;

    pierceAndRemoveClass(document);
    if (observer) observer.disconnect();
    if (periodicInterval) clearInterval(periodicInterval);

    currentSelector = selector;
    currentAmount = amount;

    if (amount > 0 && selector) {
        pierceAndInjectStyle(document, amount);
        pierceAndAddClass(document);
        setupObserver();
        startPeriodicCheck();
    }

    console.log(`%c[Content Script] Blur ${amount > 0 ? 'ACTIVE' : 'OFF'} → ${amount}px`, 'color: #00ff00; font-weight: bold;');
}

// === MESSAGE LISTENER (registered BEFORE sendMessage) ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "applyBlur") {
        applyBlur(request.classes || [], request.amount || 0);
        sendResponse({ status: "applied" });
        return true;
    }
});

// Request blur settings from background (uses sender.tab.id, works in MV3)
chrome.runtime.sendMessage({ action: "requestBlurSettings", url: location.href });
