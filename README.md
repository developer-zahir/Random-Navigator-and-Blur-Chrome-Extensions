# Random Navigator & Blur - Chrome Extension

A Chrome extension for automatic random navigation/reload and sensitive data blurring. Manage multiple tabs with configurable timers, random URL navigation, page reloads, and CSS-based blur for hiding sensitive content.

## Features

- **Auto Navigator** - Randomly navigate to URLs from a custom list with configurable time intervals
- **Auto Reload** - Reload pages a random number of times between navigate cycles
- **Sensitive Data Blur** - Blur CSS class-based elements with hover-to-reveal
- **Advanced CSS Selectors** - Support for `.class1.class2`, `#id`, `[attr]`, `tag.class` and more
- **Shadow DOM Support** - Blur works inside shadow DOM components
- **Per-Site Settings** - Each domain has its own独立 navigator and blur configuration
- **Multi-Tab Management** - Control multiple tabs simultaneously from the Active Tasks panel
- **Badge Countdown** - Visual countdown timer on the extension icon
- **Task History** - Track all navigate/reload events with timestamps
- **Statistics Dashboard** - View total actions, navigations, reloads, and unique sites
- **Export/Import Settings** - Backup and restore all settings as JSON files
- **MV3 Compatible** - Built with Manifest V3, uses `chrome.alarms` for reliable service worker timers
- **Service Worker Recovery** - Tasks are restored automatically if the service worker restarts

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in your browser
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the project folder
5. The extension icon will appear in your toolbar

## Usage

### Navigator Tab
- Set **min/max seconds** for random delay between actions
- Set **min/max reload count** for random reload cycles per page
- Enable **Navigate Only** mode to skip reloads
- Add URLs (one per line) to the URL list
- Click **Start** to begin

### Blur Settings Tab
- Enter CSS class names (comma-separated) to blur
- Supports advanced selectors: `._1xeo152._1i3bicu`, `#myId`, `[data-testid="x"]`, `div.class`
- Adjust blur amount with the slider (0-20px)
- Hover over blurred elements to reveal them temporarily

### Active Tasks Tab
- View all running tasks across tabs
- Stop individual tasks directly from the panel

### History Tab
- View statistics: total actions, navigations, reloads, unique sites
- Browse recent navigate/reload events with timestamps
- Clear history when needed

### Export/Import
- Export all settings as a JSON backup file
- Import settings from a previously exported JSON file

## How It Works

1. Start a task from the popup on any tab
2. The extension navigates to a random URL from your list after a random delay
3. After navigation, the page reloads a random number of times
4. Then it navigates to another random URL — the cycle repeats
5. Blur is applied automatically on pages where tasks are running

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save per-site settings and active tasks |
| `tabs` | Navigate, reload, and manage tabs |
| `activeTab` | Access the current tab |
| `scripting` | Content script injection |
| `alarms` | Reliable timers that survive service worker restarts |
| `<all_urls>` | Run content scripts on all pages for blur support |

## Project Structure

```
├── manifest.json       # Extension manifest (MV3)
├── background.js       # Service worker (task loop, alarms, blur dispatch)
├── content.js          # Content script (blur injection, shadow DOM piercing)
├── popup.html          # Popup UI markup
├── popup.js            # Popup logic (settings, task management)
├── assets/
│   ├── style.css       # Popup styling
│   └── HindSiliguri-*.ttf  # Bengali font
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Tech Stack

- Vanilla JavaScript (no frameworks)
- Chrome Extensions API (Manifest V3)
- `chrome.alarms` for SW-safe timers
- `MutationObserver` for dynamic DOM blur
- Shadow DOM piercing for modern web components

## License

MIT
