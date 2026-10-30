// injected.js — MAIN-world script. Has access to require() and page cookies.
(() => {
  const ORIGIN = "IG_DM_TOOLKIT";

  // ---------------- bridge ----------------
  const logHistory = [];
  function emit(type, payload = {}) {
    window.postMessage({ __src: ORIGIN, dir: "from-page", type, payload }, "*");
  }
  const log  = (msg, level = "info") => {
    logHistory.push({ msg, level, ts: Date.now() });
    if (logHistory.length > 100) logHistory.shift();
    emit("log", { msg, level });
  };
  const ok   = (msg) => log(msg, "ok");
  const fail = (msg) => log(msg, "err");
  const skip = (msg) => log(msg, "skip");
  const info = (msg) => log(msg, "info");
  const warn = (msg) => log(msg, "warn");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getCookie = (n) =>
    document.cookie.split("; ").find((c) => c.startsWith(n + "="))?.split("=")[1];

  // ---------------- state ----------------
  let tokens = {};
  let MY_FBID = null;
  let threads = [];
  let current = null;
  let STOP = false;
  let isBusy = false;

  function emitState() {
    const haveTokens = readTokens();
    MY_FBID = MY_FBID || detectFbid();
    emit("state", {
      connected: haveTokens,
      fbid: MY_FBID,
      threadsLoaded: threads.length,
      threads: threads,
      current: current ? {
        thread: current.thread,
        thread_id: current.thread_id,
        unsendable: current.unsendable.map((m) => ({
          id: m.message_id,
          type: m.content_type,
          ts: Number(m.timestamp_ms),
          preview: (m.text_body || "").slice(0, 60) || "(no text)",
        })),
        skippedCount: current.skipped ? current.skipped.length : 0,
      } : null,
      logHistory: logHistory.slice(-50),
      isBusy: isBusy,
    });
  }

  const OP_FIRST  = { name: "PolarisDirectInboxMobileQuery",         doc: "28534349112836579" };
  const OP_MORE   = { name: "IGDThreadListOffMsysPaginationQuery",   doc: "28000787896268887" };
  const OP_THREAD = { name: "IGDThreadDetailQuery",                  doc: "28047224604940200" };
  const OP_UNSEND = { name: "IGDMessageUnsendDialogOffMsysMutation", doc: "26948700068153789" };

  const UNSENDABLE_TYPES = new Set([
    "TEXT","IMAGES","VIDEOS","MEDIA","MEDIA_SHARE","LINK",
    "MESSAGE_INLINE_SHARE","MONTAGE_SHARE_XMA","REEL_SHARE",
    "CLIP","STORY_SHARE","XMA","INSTAGRAM_MESSAGING_NOTE_XMA",
  ]);
  const SYSTEM_PHRASES = [
    "Video chat ended","Video chat started","You started a video chat",
    "started a video chat","Reacted","Liked a message",
    "You changed the theme","wasn't notified","You're now connected",
    "This message was deleted",
  ];

  function checkMessage(n) {
    if (!n) return { skip: true, reason: "empty" };
    if (!MY_FBID) return { skip: true, reason: "account not yet detected" };
    if (String(n.sender_fbid) !== MY_FBID) return { skip: true, reason: "not your message" };
    if (!UNSENDABLE_TYPES.has(n.content_type))
      return { skip: true, reason: "type not unsendable (" + n.content_type + ")" };
    if (n.content?.__typename === "SlideMessageAdminText")
      return { skip: true, reason: "system/admin message" };
    const frag = (n.content?.text_fragments || []).map((f) => f.plaintext || "").join(" ");
    const combined = (n.text_body || "") + " " + frag;
    if (SYSTEM_PHRASES.some((p) => combined.includes(p)))
      return { skip: true, reason: "system phrase in content" };
    return { skip: false };
  }

  // ---------------- tokens ----------------
  function readTokens() {
    tokens = {};
    try { tokens.fb_dtsg = require("DTSGInitialData").token; } catch (_) {}
    try { tokens.lsd     = require("LSD").token; } catch (_) {}
    if (tokens.fb_dtsg) {
      let s = 0; for (const c of tokens.fb_dtsg) s += c.charCodeAt(0);
      tokens.jazoest = "2" + s;
    }
    tokens.csrftoken = getCookie("csrftoken");
    return !!(tokens.fb_dtsg && tokens.lsd && tokens.csrftoken);
  }

  function detectFbid() {
    try {
      const m = document.documentElement.innerHTML.match(
        /"interop_messaging_user_fbid"\s*:\s*"(\d+)"/
      );
      if (m) return m[1];
    } catch (_) {}
    try { return require("PolarisViewerData").interop_messaging_user_fbid; } catch (_) {}
    try { return require("CurrentUserInitialData").INTEROP_MESSAGING_USER_FBID; } catch (_) {}
    return null;
  }

  // ---------------- GraphQL ----------------
  let reqN = 0;
  async function gql(op, variables) {
    const body = new URLSearchParams({
      av: "17841405364287909",
      __d: "www", __user: "0", __a: "1",
      __req: (reqN++).toString(36),
      __hs: "20711.HYP:instagram_web_pkg.2.1...0",
      dpr: "3", __ccg: "EXCELLENT", __rev: "1047557390", __comet_req: "7",
      fb_dtsg: tokens.fb_dtsg,
      jazoest: tokens.jazoest,
      lsd: tokens.lsd,
      __spin_r: "1047557390", __spin_b: "trunk",
      __crn: "comet.igweb.PolarisDirectInboxMobileRoute",
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: op.name,
      server_timestamps: "true",
      variables: JSON.stringify(variables),
      doc_id: op.doc,
    });
    const res = await fetch("https://www.instagram.com/api/graphql", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": tokens.csrftoken,
        "X-FB-LSD": tokens.lsd,
        "X-IG-App-ID": "1217981644879628",
      },
      body: body.toString(),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, ok: res.ok, json, text };
  }

  // ---------------- helpers ----------------
  function findEdgeList(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 8) return null;
    if (Array.isArray(obj.edges) && obj.edges.length &&
        obj.edges[0]?.node?.as_ig_direct_thread) return obj;
    for (const k of Object.keys(obj)) {
      const r = findEdgeList(obj[k], depth + 1);
      if (r) return r;
    }
    return null;
  }

  function fbidFromInbox(json) {
    const edges = json?.data?.get_slide_mailbox_for_iris_subscription
      ?.threads_by_folder?.edges || [];
    for (const e of edges) {
      const v = e?.node?.as_ig_direct_thread?.viewer?.interop_messaging_user_fbid;
      if (v) return v;
    }
    return null;
  }

  function threadRow(t) {
    const last = t.slide_messages?.edges?.[0]?.node || {};
    return {
      title: t.thread_title,
      username: t.users?.[0]?.username || "",
      thread_fbid: t.thread_fbid,
      thread_id: t.thread_id,
      last_from: last.sender_fbid === MY_FBID ? "you" : (t.users?.[0]?.username || "them"),
    };
  }

  // ---------------- commands ----------------
  async function cmdDetect() {
    const haveTokens = readTokens();
    if (!haveTokens) {
      emitState();
      return fail("Not logged in. Open instagram.com and log in first.");
    }
    MY_FBID = MY_FBID || detectFbid();
    emitState();
    ok("Session ready." + (MY_FBID ? " Account id: " + MY_FBID : " (id will resolve on load)"));
  }

  async function cmdLoad() {
    if (!readTokens()) return fail("No session. Log in to instagram.com first.");
    if (!MY_FBID) MY_FBID = detectFbid();

    isBusy = true;
    emit("progress", { action: "load", step: "page1" });
    info("Loading threads…");

    const seen = new Map();
    const p1 = await gql(OP_FIRST, {
      device_id_for_iris_subscription: "0043ad80-2cb4-4641-b652-12f5847ea4cd",
      __relay_internal__pv__IGDIsProfessionalAccountGKrelayprovider: false,
      __relay_internal__pv__IGDPinnedThreadsRenderEnabledGKrelayprovider: true,
      __relay_internal__pv__IGDMaxUnreadMessagesCountrelayprovider: 5,
      __relay_internal__pv__IGDThreadListActionsEnabledGKrelayprovider: true,
    });
    if (!p1.ok) { isBusy = false; return fail("Page 1 failed (HTTP " + p1.status + ")"); }
    if (!MY_FBID) {
      MY_FBID = fbidFromInbox(p1.json);
      if (!MY_FBID) { isBusy = false; return fail("Could not determine your account id."); }
      ok("Account id: " + MY_FBID);
    }
    const list1 = findEdgeList(p1.json?.data);
    if (!list1) { isBusy = false; return fail("Unexpected page-1 shape."); }
    for (const e of list1.edges) {
      const row = threadRow(e.node.as_ig_direct_thread);
      seen.set(row.thread_fbid, row);
    }
    let cursor = list1.page_info?.end_cursor || null;
    ok("Page 1: " + seen.size + " threads");

    let page = 1;
    while (cursor && page < 60) {
      page++;
      emit("progress", { action: "load", step: "page" + page, total: seen.size });
      const more = await gql(OP_MORE, {
        count: 5, cursor, folder: "INBOX",
        newer_than_timestamp_ms: null, id: MY_FBID,
        __relay_internal__pv__IGDPinnedThreadsRenderEnabledGKrelayprovider: true,
        __relay_internal__pv__IGDMaxUnreadMessagesCountrelayprovider: 5,
        __relay_internal__pv__IGDThreadListActionsEnabledGKrelayprovider: true,
      });
      if (!more.ok) { fail("Page " + page + " HTTP " + more.status); break; }
      const listN = findEdgeList(more.json?.data);
      if (!listN) { fail("Page " + page + " bad shape"); break; }
      const before = seen.size;
      for (const e of listN.edges) {
        const t = e.node.as_ig_direct_thread || e.node;
        const row = threadRow(t);
        seen.set(row.thread_fbid, row);
      }
      ok("Page " + page + ": +" + (seen.size - before) + " (total " + seen.size + ")");
      const hasNext = listN.page_info?.has_next_page;
      const newCur = listN.page_info?.end_cursor;
      if (!hasNext || !newCur || newCur === cursor) break;
      cursor = newCur;
      await sleep(1200);
    }
    threads = [...seen.values()];
    isBusy = false;
    ok("TOTAL THREADS: " + threads.length);
    emit("threads", { threads });
    emitState();
  }

  async function cmdOpen(index) {
    const t = threads[index];
    if (!t) return fail("No thread at index " + index);
    info('Opening "' + t.title + '"…');
    emit("progress", { action: "open", step: "reading" });

    const read = await gql(OP_THREAD, {
      min_uq_seq_id: null,
      thread_fbid: t.thread_fbid,
      __relay_internal__pv__IGDEnableOffMsysChatThemesQErelayprovider: false,
      __relay_internal__pv__IGDInitialMessagePageCountrelayprovider: 50,
    });
    if (!read.ok) return fail("Read failed HTTP " + read.status);
    const thread = read.json?.data?.get_slide_thread_nullable?.as_ig_direct_thread;
    if (!thread) return fail("No data for that chat.");
    if (!MY_FBID && thread.viewer?.interop_messaging_user_fbid) {
      MY_FBID = thread.viewer.interop_messaging_user_fbid;
    }
    const all = (thread.slide_messages?.edges || []).map((e) => e.node).filter(Boolean);
    const unsendable = [], skipped = [];
    for (const m of all) {
      const c = checkMessage(m);
      if (c.skip) {
        if (String(m.sender_fbid) === MY_FBID) skipped.push({ m, reason: c.reason });
      } else unsendable.push(m);
    }
    ok("Visible: " + all.length + " · yours unsendable: " + unsendable.length + " · skipped: " + skipped.length);
    current = { thread: t, unsendable, skipped, thread_id: t.thread_id };
    emit("messages", {
      thread: t,
      unsendable: unsendable.map((m) => ({
        id: m.message_id,
        type: m.content_type,
        ts: Number(m.timestamp_ms),
        preview: (m.text_body || "").slice(0, 60) || "(no text)",
      })),
      skipped: skipped.map((s) => ({
        id: s.m.message_id,
        type: s.m.content_type,
        ts: Number(s.m.timestamp_ms),
        reason: s.reason,
      })),
    });
    emitState();
  }

  async function cmdUnsendOne(index) {
    if (!current) return fail("Open a chat first.");
    const m = current.unsendable[index];
    if (!m) return fail("No message at index " + index);
    info("Unsending " + m.message_id + "…");
    const r = await gql(OP_UNSEND, {
      message_id: m.message_id,
      send_data: { thread_id: current.thread_id },
    });
    if (r.ok && r.json?.data?.direct_unsend_message === true) {
      ok("Unsent " + m.message_id);
      current.unsendable.splice(index, 1);
      emit("unsent", { id: m.message_id });
      emitState();
    } else {
      fail("Refused: " + r.text.slice(0, 200));
      if (/rate|spam|limit|5200003/i.test(r.text))
        warn("Rate-limited. Wait 1+ hour.");
    }
  }

  async function cmdUnsendAll({ max = 100, delayMs = 2000 } = {}) {
    if (!current) return fail("Open a chat first.");
    STOP = false;
    isBusy = true;
    const targets = [...current.unsendable];
    const total = Math.min(max, targets.length);
    info("Bulk unsend: up to " + total + " messages, " + Math.round(delayMs / 1000) + "s apart.");
    let sent = 0, failed = 0, refused = false;
    for (let i = 0; i < targets.length && sent < max; i++) {
      if (STOP) { info("Stopped by user."); break; }
      const m = targets[i];
      emit("progress", { action: "unsend", i: sent + 1, total });
      const r = await gql(OP_UNSEND, {
        message_id: m.message_id,
        send_data: { thread_id: current.thread_id },
      });
      if (r.ok && r.json?.data?.direct_unsend_message === true) {
        sent++; ok("(" + sent + "/" + total + ") unsent " + m.message_id);
        emit("unsent", { id: m.message_id });
        const idx = current.unsendable.findIndex((x) => x.message_id === m.message_id);
        if (idx !== -1) current.unsendable.splice(idx, 1);
        emitState();
      } else {
        failed++;
        if (r.json?.errors?.[0]?.description === "System messages cannot be unsent.") {
          skip("System message — continuing.");
          continue;
        }
        if (/rate|spam|limit|5200003/i.test(r.text)) {
          warn("Rate-limited. Wait 1+ hour.");
          refused = true;
          break;
        }
        fail("Failed " + m.message_id);
      }
      if (sent < max && i < targets.length - 1) await sleep(delayMs);
    }
    isBusy = false;
    emit("done", { sent, failed, refused });
    emitState();
  }

  // ---------------- message bus ----------------
  window.addEventListener("message", async (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__src !== ORIGIN || d.dir !== "to-page") return;
    const { cmd, args = {} } = d;
    try {
      switch (cmd) {
        case "ping":
        case "get-state":
          readTokens();
          await cmdDetect();
          break;
        case "load":      await cmdLoad(); break;
        case "open":      await cmdOpen(args.index); break;
        case "unsendOne": await cmdUnsendOne(args.index); break;
        case "unsendAll": await cmdUnsendAll(args); break;
        case "stop":      STOP = true; info("Stop signal received."); break;
        default: fail("Unknown command: " + cmd);
      }
    } catch (e) {
      fail("Error: " + (e?.message || e));
    }
    emit("idle");
    emitState();
  });

  // ---------------- boot ----------------
  emit("ready");

  // Re-announce state a few times so a late-opening popup still gets it
  let announced = 0;
  const annTimer = setInterval(() => {
    announced++;
    emitState();
    if (announced >= 5) clearInterval(annTimer);
  }, 1000);
})();