<div align="center">

# 🌸 Only for Pearl

**A Chrome Extension to review and silently unsend your own Instagram Direct Messages.**

[![Version](https://img.shields.io/badge/version-1.0.0-ff6fae?style=flat-square)](.)
[![Manifest](https://img.shields.io/badge/Manifest-v3-blueviolet?style=flat-square)](.)
[![Platform](https://img.shields.io/badge/platform-Chrome%20%2F%20Edge-4285F4?style=flat-square)](.)
[![License](https://img.shields.io/badge/license-Personal%20Use-lightgrey?style=flat-square)](.)

</div>

---

## ✨ What It Does

**Only for Pearl** lets you browse and **unsend your own Instagram DMs** directly from a clean popup or a floating in-page sidebar — no third-party server, no login required. Everything runs locally inside your browser.

| Feature | Description |
|---|---|
| 📋 **Load Chats** | Fetches all your DM conversations in one click |
| 🔍 **Search** | Filter threads by name or `@username` instantly |
| 🗑️ **Bulk Unsend** | Unsend up to **100 messages** from any conversation |
| 💬 **Float UI** | A persistent sidebar that stays on the Instagram page |
| ⏱️ **Speed Control** | Choose Fast (2s), Medium (4s), or Safe (7s) delay between unsends |
| 🛑 **Stop Anytime** | Interrupt an in-progress unsend batch immediately |
| 📝 **Activity Log** | See a real-time log of every action taken |

> **Privacy first:** The extension never sends your data anywhere. It communicates only with Instagram's own page within your logged-in session.

---

## 🚀 Installation (Unpacked / Developer Mode)

Since this extension is not on the Chrome Web Store, you load it manually in a few easy steps.

### Step 1 — Download the Extension

Download or clone this repository and note the folder path.

```
📁 extension - Copy/
├── manifest.json
├── background.js
├── content.js
├── injected.js
├── popup.html / popup.js / popup.css
├── styles.css
└── icons/
```

### Step 2 — Open Chrome Extensions

1. Open **Google Chrome** (or Microsoft Edge).
2. Navigate to:
   ```
   chrome://extensions
   ```
3. Toggle **Developer mode** ON (top-right corner).

### Step 3 — Load the Extension

1. Click **"Load unpacked"**.
2. Select the `extension - Copy` folder (the one containing `manifest.json`).
3. The extension will appear in your toolbar as 🌸.

> **Tip:** Pin it to the toolbar by clicking the puzzle piece icon 🧩 and pinning "Only for Pearl".

---

## 🧭 How to Use

### Method A — Popup (Recommended)

1. Navigate to **[instagram.com](https://www.instagram.com)** and make sure you are **logged in**.
2. Click the 🌸 extension icon in your Chrome toolbar.
3. Follow the **3-step flow** inside the popup:

```
[ 1 · Load Chats ]  →  Pick a conversation  →  [ Unsend Messages ]
```

4. Use the **🔍 search box** to find a specific chat by name or `@username`.
5. Click **"Unsend Messages (up to 100)"** to start the batch.
6. Hit **Stop** at any time to cancel.

### Method B — Floating Sidebar (In-Page)

1. While on **instagram.com**, click the 🌸 popup and press **"💬 Float UI"**.
2. A **minimized sidebar tab** (🌸) will appear on the right edge of the page.
3. Click the tab to expand it — the sidebar has the same full functionality as the popup.
4. Click ✕ to collapse it back to the edge tab.

---

## ⚙️ Speed Settings

Control how fast messages are unsent to avoid rate limits:

| Mode | Delay | Best For |
|---|---|---|
| ⚡ **Fast** | 2 seconds | Small batches, low-volume accounts |
| ⏳ **Medium** | 4 seconds | General use (recommended) |
| 🛡️ **Safe** | 7 seconds | Large batches, avoiding any rate-limit risk |

---

## ❓ Troubleshooting

### The popup shows a ⚠️ warning

> *"Please open instagram.com, ensure you are logged in, then reload the page tab and reopen this popup."*

**Fix:** Make sure:
- Your active tab is `instagram.com`.
- You are **logged into your account**.
- You have **refreshed the page** after installing the extension, then reopened the popup.

---

### No conversations appear after loading

- Instagram may have throttled your session. Wait a minute and try again.
- Try switching to **Safe (7s)** speed mode.
- Make sure you have existing Direct Message conversations.

---

### Messages do not unsend / errors in the Activity Log

- Instagram occasionally changes its internal API. Refresh the page and retry.
- Make sure the Instagram tab remains **active and visible** during the unsend process.

---

### The Float UI / sidebar does not appear

- Reload the Instagram tab after installing the extension.
- Try navigating to the DMs section (`instagram.com/direct/inbox/`) first.

---

## 🔒 Permissions Explained

| Permission | Why It Is Needed |
|---|---|
| `activeTab` | Read the currently active Instagram tab |
| `scripting` | Inject the helper script into the page |
| `storage` | Reserved for future settings persistence |
| `sidePanel` | Open as a Chrome Side Panel instead of a popup |
| `host: instagram.com` | Restrict all actions exclusively to Instagram |

No other websites are ever accessed.

---

## 🛠️ Technical Overview

```
popup.html / popup.js
        │  (chrome.runtime.sendMessage)
        ▼
  background.js  ←── service worker / message router
        │  (chrome.tabs.sendMessage)
        ▼
  content.js  ←── isolated-world bridge + Float UI manager
        │  (window.postMessage)
        ▼
  injected.js  ←── MAIN-world script (accesses Instagram internals)
```

- **Manifest V3** compliant — uses a service worker, not a persistent background page.
- All DM operations use Instagram's own internal endpoints within your authenticated session.
- Zero external network calls.

---

## 📋 Changelog

### v1.0.0 — Initial Release
- Load and browse DM threads
- Bulk unsend up to 100 messages per conversation
- Floating in-page sidebar with minimise/expand
- Speed delay selector (Fast / Medium / Safe)
- Activity log panel
- Stop button to interrupt any running batch

---

## ⚠️ Disclaimer

This extension interacts with Instagram's internal APIs within your own logged-in browser session. Use it responsibly:

- **Only your own messages** can be unsent. You cannot delete other people's messages.
- Excessive rapid usage may trigger Instagram's rate-limiting or temporary action blocks.
- This tool is for **personal use only** and is not affiliated with or endorsed by Meta/Instagram.

---

<div align="center">

Made with 🌸 — *Only for Pearl*

</div>
