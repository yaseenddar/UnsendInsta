// background.js — hardened router between popup/sidepanel and content script
const ORIGIN = "IG_DM_TOOLKIT";

if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === "function") {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.__src !== ORIGIN) return;

  // ---- popup → active tab's content script ----
  if (msg.dir === "to-page") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        console.warn("[IG-DM bg] no active tab");
        return sendResponse({ ok: false, reason: "no active tab" });
      }

      const trySend = (attempt = 0) => {
        chrome.tabs.sendMessage(tab.id, msg, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) {
            if (attempt < 2) {
              // content script not ready yet — retry shortly
              setTimeout(() => trySend(attempt + 1), 250);
            } else {
              console.warn("[IG-DM bg] tabs.sendMessage failed:", err.message);
              sendResponse({ ok: false, reason: err.message });
            }
          } else {
            sendResponse({ ok: true, resp });
          }
        });
      };
      trySend();
    });
    return true; // keep channel open for async response
  }

  // ---- content script → extension pages (popup) ----
  if (msg.dir === "from-page") {
    // Broadcast to extension pages. The popup filters by __src + dir.
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
});