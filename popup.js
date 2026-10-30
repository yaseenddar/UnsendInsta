// popup.js — UI controller
const ORIGIN = "IG_DM_TOOLKIT";
const $ = (s) => document.querySelector(s);

let threads = [];
let unsendable = [];
let selectedThreadIdx = -1;
let hasResponded = false; // set true once we get any state from the page

// ---------- bridge helpers ----------
function sendToPage(cmd, args = {}) {
  const msg = { __src: ORIGIN, dir: "to-page", cmd, args };
  chrome.runtime.sendMessage(msg, (resp) => {
    if (chrome.runtime.lastError) {
      console.warn("[IG-DM popup] sendMessage error:", chrome.runtime.lastError.message);
      showUnreachable(chrome.runtime.lastError.message);
    } else if (resp && resp.ok === false) {
      showUnreachable(resp.reason || "no response");
    }
  });
}

function setStatus(text, cls) {
  const el = $("#status");
  el.textContent = text;
  el.className = "pill " + (cls || "pill--idle");
}

function logLine(msg, level = "info") {
  const pre = $("#log");
  const div = document.createElement("div");
  div.className = "log-" + level;
  div.textContent = msg;
  pre.appendChild(div);
  pre.scrollTop = pre.scrollHeight;
}

function showUnreachable(reason) {
  if (hasResponded) return;
  setStatus("not reachable", "pill--bad");
  $("#gate").classList.remove("hidden");
  $("#main").classList.add("hidden");
  logLine("Page script never responded." + (reason ? " (" + reason + ")" : ""), "err");
  logLine("Fix: open instagram.com, log in, RELOAD the tab, then reopen this popup.", "warn");
}

// ---------- incoming from page ----------
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.__src !== ORIGIN || msg.dir !== "from-page") return;

  switch (msg.type) {
    case "content-ready":
    case "ready":
      sendToPage("get-state");
      break;

    case "state": {
      hasResponded = true;
      const p = msg.payload || {};
      if (p.connected) {
        setStatus(p.isBusy ? "working…" : "connected", p.isBusy ? "pill--idle" : "pill--ok");
        $("#gate").classList.add("hidden");
        $("#main").classList.remove("hidden");
        if (p.threads) {
          threads = p.threads;
          renderThreads();
          $("#threadsWrap").classList.remove("hidden");
        }
        if (p.current) {
          unsendable = p.current.unsendable || [];
          $("#chatTitle").textContent = p.current.thread?.title || "—";
          $("#chatSub").textContent = "@" + (p.current.thread?.username || "");
          $("#chatWrap").classList.remove("hidden");
          renderMessages();
        }
        if (Array.isArray(p.logHistory) && p.logHistory.length) {
          const pre = $("#log");
          pre.innerHTML = "";
          p.logHistory.forEach(l => logLine(l.msg, l.level));
        }
      } else {
        setStatus("not logged in", "pill--bad");
        $("#gate").classList.remove("hidden");
        $("#main").classList.add("hidden");
      }
      break;
    }

    case "log":
      logLine(msg.payload?.msg || "", msg.payload?.level || "info");
      break;

    case "progress":
      if (msg.payload?.action === "load") {
        setStatus("loading " + (msg.payload.step || ""), "pill--idle");
      }
      if (msg.payload?.action === "unsend") {
        setStatus("unsending " + msg.payload.i + "/" + msg.payload.total, "pill--idle");
      }
      break;

    case "threads":
      threads = msg.payload?.threads || [];
      renderThreads();
      $("#threadsWrap").classList.remove("hidden");
      setStatus("connected", "pill--ok");
      break;

    case "messages": {
      const p = msg.payload || {};
      unsendable = p.unsendable || [];
      $("#chatTitle").textContent = p.thread?.title || "—";
      $("#chatSub").textContent = "@" + (p.thread?.username || "");
      $("#chatWrap").classList.remove("hidden");
      renderMessages();
      break;
    }

    case "unsent":
      unsendable = unsendable.filter((m) => m.id !== msg.payload?.id);
      renderMessages();
      break;

    case "done":
      setStatus("connected", "pill--ok");
      $("#btnStop").disabled = true;
      $("#btnUnsendAll").disabled = false;
      break;

    case "idle":
      if ($("#status").textContent.startsWith("loading")) setStatus("connected", "pill--ok");
      break;
  }
});

// ---------- render ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderThreads() {
  const q = ($("#filter").value || "").toLowerCase();
  const ul = $("#threads");
  ul.innerHTML = "";
  threads
    .map((t, i) => ({ t, i }))
    .filter(({ t }) =>
      !q ||
      (t.title || "").toLowerCase().includes(q) ||
      (t.username || "").toLowerCase().includes(q)
    )
    .forEach(({ t, i }) => {
      const li = document.createElement("li");
      if (i === selectedThreadIdx) li.classList.add("selected");
      li.innerHTML =
        `<span class="title">${escapeHtml(t.title || "(no title)")}</span>` +
        `<span class="muted">@${escapeHtml(t.username || "—")} · last: ${escapeHtml(t.last_from || "")}</span>`;
      li.onclick = () => {
        selectedThreadIdx = i;
        chrome.storage.local.set({ selectedThreadIdx: i });
        renderThreads();
        sendToPage("open", { index: i });
      };
      ul.appendChild(li);
    });
}

function renderMessages() {
  const ul = $("#messages");
  ul.innerHTML = "";
  if (!unsendable.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No unsendable messages of yours in this chat.";
    ul.appendChild(li);
    $("#btnUnsendAll").disabled = true;
    return;
  }
  $("#btnUnsendAll").disabled = false;
  unsendable.forEach((m, i) => {
    const li = document.createElement("li");
    const date = new Date(m.ts).toLocaleString();
    li.innerHTML =
      `<div class="msg-header"><span class="title">[${i}] ${escapeHtml(m.preview)}</span><span class="msg-badge">${escapeHtml(m.type)}</span></div>` +
      `<span class="time">${date}</span>`;
    const btn = document.createElement("button");
    btn.textContent = "Unsend";
    btn.className = "danger";
    btn.style.marginTop = "4px";
    btn.style.alignSelf = "flex-start";
    btn.onclick = () => {
      btn.disabled = true;
      btn.textContent = "…";
      sendToPage("unsendOne", { index: i });
    };
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

// ---------- wiring ----------
$("#btnLoad").onclick = () => {
  $("#btnLoad").disabled = true;
  $("#log").innerHTML = "";
  logLine("Loading…", "info");
  sendToPage("load");
  setTimeout(() => { $("#btnLoad").disabled = false; }, 1500);
};

const btnWidget = $("#btnWidget");
if (btnWidget) {
  btnWidget.onclick = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { __src: ORIGIN, cmd: "toggle-widget" }, () => {
          window.close();
        });
      }
    });
  };
}

$("#btnStop").onclick = () => {
  sendToPage("stop");
  $("#btnStop").disabled = true;
  $("#btnUnsendAll").disabled = false;
};

$("#btnUnsendAll").onclick = () => {
  $("#btnUnsendAll").disabled = true;
  $("#btnStop").disabled = false;
  sendToPage("unsendAll", { max: 100, delayMs: 2000 });
};

$("#filter").oninput = () => {
  chrome.storage.local.set({ filterQuery: $("#filter").value });
  renderThreads();
};

// Restore saved preferences
chrome.storage.local.get(["selectedThreadIdx", "filterQuery"], (res) => {
  if (typeof res.selectedThreadIdx === "number") selectedThreadIdx = res.selectedThreadIdx;
  if (res.filterQuery) $("#filter").value = res.filterQuery;
});

// ---------- boot ----------
setStatus("checking…", "pill--idle");
sendToPage("get-state");

// Watchdog: if nothing answered within 3 seconds, show warning
setTimeout(() => {
  if (!hasResponded) {
    showUnreachable("no response within 3s");
  }
}, 3000);