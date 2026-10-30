// content.js — isolated-world bridge & in-page persistent sidebar manager.
(() => {
  const ORIGIN = "IG_DM_TOOLKIT";

  // Inject MAIN-world script exactly once per document
  if (!document.documentElement.dataset.igDmInjected) {
    document.documentElement.dataset.igDmInjected = "1";
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("injected.js");
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------------- In-Page Persistent Sidebar ----------------
  let widgetState = {
    threads: [],
    unsendable: [],
    selectedIdx: -1,
    status: "Ready",
  };

  function sendToPage(cmd, args = {}) {
    window.postMessage({ __src: ORIGIN, dir: "to-page", cmd, args }, "*");
  }

  function initWidget() {
    if (document.getElementById("ig-deleter-widget")) return;

    const w = document.createElement("div");
    w.id = "ig-deleter-widget";
    w.className = "minimized"; // Start collapsed to slim edge tab
    w.innerHTML = `
      <div class="ig-deleter-minimized-icon" title="Open Only for Pearl Sidebar">🌸</div>
      <div class="ig-deleter-content">
        <div class="ig-deleter-header">
          <div class="ig-deleter-title">🌸 Only for Pearl</div>
          <button class="ig-deleter-toggle-btn" id="ig-w-min-btn" title="Collapse Sidebar">✕</button>
        </div>
        <div class="ig-deleter-status-card">
          <span class="ig-deleter-status-text">Status: <strong id="ig-w-status" class="ig-deleter-status-value">Ready</strong></span>
          <span id="ig-w-count" class="ig-deleter-count"></span>
        </div>
        <div class="ig-deleter-controls">
          <button id="ig-w-btn-load" class="ig-deleter-btn ig-deleter-btn-primary">1 · Load Chats</button>
          <button id="ig-w-btn-stop" class="ig-deleter-btn ig-deleter-btn-danger" disabled>Stop</button>
        </div>
        <div id="ig-w-threads-wrap" style="display:none; margin-bottom: 12px; flex:1; display:flex; flex-direction:column; min-height:0;">
          <input id="ig-w-filter" type="text" placeholder="🔍 Search chats..." style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.4); color:#fff; font-size:12px; margin-bottom:8px; outline:none;" />
          <ul id="ig-w-threads" style="list-style:none; padding:0; margin:0; flex:1; max-height:220px; overflow-y:auto; border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:rgba(0,0,0,0.2);"></ul>
        </div>
        <div id="ig-w-chat-wrap" style="display:none; margin-bottom: 12px; flex:1; display:flex; flex-direction:column; min-height:0;">
          <div style="font-weight:600; font-size:13px; color:#0095f6; margin-bottom:6px;" id="ig-w-chat-title"></div>
          <button id="ig-w-btn-unsend-all" class="ig-deleter-btn ig-deleter-btn-primary" style="width:100%; margin-bottom:8px;">Unsend Messages (up to 100)</button>
          <ul id="ig-w-messages" style="list-style:none; padding:0; margin:0; flex:1; max-height:220px; overflow-y:auto; border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:rgba(0,0,0,0.2);"></ul>
        </div>
        <div class="ig-deleter-speed-row">
          <span>Speed Delay:</span>
          <select id="ig-w-speed" class="ig-deleter-speed-select">
            <option value="2000" selected>Fast (2s)</option>
            <option value="4000">Medium (4s)</option>
            <option value="7000">Safe (7s)</option>
          </select>
        </div>
      </div>
    `;

    document.body.appendChild(w);

    // Wire sidebar toggle events
    const icon = w.querySelector(".ig-deleter-minimized-icon");
    const minBtn = w.querySelector("#ig-w-min-btn");
    icon.onclick = (e) => { e.stopPropagation(); w.classList.remove("minimized"); sendToPage("get-state"); };
    minBtn.onclick = (e) => { e.stopPropagation(); w.classList.add("minimized"); };

    w.querySelector("#ig-w-btn-load").onclick = () => sendToPage("load");
    w.querySelector("#ig-w-btn-stop").onclick = () => sendToPage("stop");
    
    const filterInput = w.querySelector("#ig-w-filter");
    if (filterInput) filterInput.oninput = () => renderWidgetThreads();

    const unsendAllBtn = w.querySelector("#ig-w-btn-unsend-all");
    if (unsendAllBtn) {
      unsendAllBtn.onclick = () => {
        const delay = parseInt(w.querySelector("#ig-w-speed").value || "2000", 10);
        sendToPage("unsendAll", { max: 100, delayMs: delay });
      };
    }
  }

  function renderWidgetThreads() {
    const ul = document.getElementById("ig-w-threads");
    if (!ul) return;
    const filter = (document.getElementById("ig-w-filter")?.value || "").toLowerCase();
    ul.innerHTML = "";
    widgetState.threads.forEach((t, i) => {
      if (filter && !(t.title || "").toLowerCase().includes(filter) && !(t.username || "").toLowerCase().includes(filter)) return;
      const li = document.createElement("li");
      li.style.cssText = "padding:8px 10px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.06); font-size:12px; display:flex; justify-content:space-between; align-items:center;";
      li.innerHTML = `<span style="font-weight:600; color:#f4f4f5;">${t.title || "(no title)"}</span><span style="color:#888; font-size:11px;">@${t.username || ""}</span>`;
      li.onclick = () => {
        widgetState.selectedIdx = i;
        sendToPage("open", { index: i });
      };
      ul.appendChild(li);
    });
  }

  function renderWidgetMessages() {
    const ul = document.getElementById("ig-w-messages");
    if (!ul) return;
    ul.innerHTML = "";
    if (!widgetState.unsendable.length) {
      const li = document.createElement("li");
      li.style.cssText = "padding:10px; color:#888; font-size:12px; text-align:center;";
      li.textContent = "No unsendable messages found.";
      ul.appendChild(li);
      return;
    }
    widgetState.unsendable.forEach((m, i) => {
      const li = document.createElement("li");
      li.style.cssText = "padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.06); font-size:11.5px; display:flex; justify-content:space-between; align-items:center; gap:6px;";
      li.innerHTML = `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${m.preview}</span>`;
      const btn = document.createElement("button");
      btn.textContent = "Unsend";
      btn.style.cssText = "background:#ef4444; color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:11px; font-weight:600; cursor:pointer;";
      btn.onclick = () => sendToPage("unsendOne", { index: i });
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function updateWidgetUI(type, payload) {
    const statusEl = document.getElementById("ig-w-status");
    if (type === "state") {
      const p = payload || {};
      if (p.connected) {
        if (statusEl) statusEl.textContent = p.isBusy ? "Working..." : "Connected";
        if (p.threads) {
          widgetState.threads = p.threads;
          const tw = document.getElementById("ig-w-threads-wrap");
          if (tw && p.threads.length) tw.style.display = "flex";
          renderWidgetThreads();
        }
        if (p.current) {
          widgetState.unsendable = p.current.unsendable || [];
          const cw = document.getElementById("ig-w-chat-wrap");
          const ct = document.getElementById("ig-w-chat-title");
          if (cw) cw.style.display = "flex";
          if (ct) ct.textContent = p.current.thread?.title || "Chat";
          renderWidgetMessages();
        }
      }
    } else if (type === "threads") {
      widgetState.threads = payload?.threads || [];
      const tw = document.getElementById("ig-w-threads-wrap");
      if (tw) tw.style.display = "flex";
      renderWidgetThreads();
    } else if (type === "messages") {
      widgetState.unsendable = payload?.unsendable || [];
      const cw = document.getElementById("ig-w-chat-wrap");
      const ct = document.getElementById("ig-w-chat-title");
      if (cw) cw.style.display = "flex";
      if (ct) ct.textContent = payload?.thread?.title || "Chat";
      renderWidgetMessages();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidget);
  } else {
    initWidget();
  }

  // ---------------- Message Router ----------------
  // page (MAIN) → content (isolated) → background → popup
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__src !== ORIGIN || d.dir !== "from-page") return;

    updateWidgetUI(d.type, d.payload);
    chrome.runtime.sendMessage({ ...d, fromTab: true }).catch(() => {});
  });

  // popup → background → content → page (MAIN)
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.__src !== ORIGIN) return;
    if (msg.cmd === "toggle-widget") {
      const w = document.getElementById("ig-deleter-widget");
      if (w) w.classList.toggle("minimized");
      sendResponse({ ok: true });
      return true;
    }
    if (msg.dir === "to-page") {
      window.postMessage(msg, "*");
      sendResponse({ ok: true });
      return true;
    }
  });

  // Notify popup that this tab's content script is alive
  chrome.runtime.sendMessage({
    __src: ORIGIN,
    dir: "from-page",
    fromTab: true,
    type: "content-ready",
    payload: {},
  }).catch(() => {});
})();