import {
  createSession,
  getSession,
  listSessionMessages,
  sendMessage,
  subscribeMessageEvents,
  getMessage,
} from "./api.js";

const STORAGE_SESSION = "builder.sessionId";
const STORAGE_USER = "builder.userId";

const $ = (id) => document.getElementById(id);

const chat = $("chat");
const composer = $("composerInput");
const btnSend = $("btnSend");
const btnNew = $("btnNewSession");
const activityStrip = $("activityStrip");
const activityLabel = $("activityLabel");
const previewFrame = $("previewFrame");
const previewEmpty = $("previewEmpty");
const previewBadge = $("previewBadge");
const previewDock = $("previewDock");
const btnTogglePreview = $("btnTogglePreview");

let sessionId = localStorage.getItem(STORAGE_SESSION);
let userId = localStorage.getItem(STORAGE_USER) || "demo-user";
let activeEsClose = null;
let assistantBubble = null;

function scrollChat() {
  chat.scrollTop = chat.scrollHeight;
}

function addBubble(className, text) {
  const el = document.createElement("div");
  el.className = `msg ${className}`;
  el.textContent = text;
  chat.appendChild(el);
  scrollChat();
  return el;
}

function showTyping(show) {
  let el = chat.querySelector(".typing");
  if (!show) {
    el?.remove();
    return;
  }
  if (el) return;
  el = document.createElement("div");
  el.className = "typing";
  el.setAttribute("aria-label", "Assistant is thinking");
  el.innerHTML = "<span></span><span></span><span></span>";
  chat.appendChild(el);
  scrollChat();
}

function setActivity(label) {
  if (!label) {
    activityStrip.hidden = true;
    return;
  }
  activityStrip.hidden = false;
  activityLabel.textContent = label;
}

function setPreview(url) {
  if (!url) return;
  previewFrame.src = url;
  previewFrame.classList.add("loaded");
  previewBadge.hidden = false;
}

function setComposerEnabled(on) {
  btnSend.disabled = !on;
  composer.disabled = !on;
}

async function ensureSession() {
  if (sessionId) {
    const s = await getSession(sessionId);
    if (s) {
      if (s.previewUrl) setPreview(s.previewUrl);
      return s;
    }
    sessionId = null;
    localStorage.removeItem(STORAGE_SESSION);
  }
  const s = await createSession(userId);
  sessionId = s.id;
  localStorage.setItem(STORAGE_SESSION, sessionId);
  localStorage.setItem(STORAGE_USER, userId);
  return s;
}

async function loadHistory() {
  if (!sessionId) return;
  const messages = await listSessionMessages(sessionId);
  for (const m of messages) {
    addBubble("msg-user", m.content);
    if (m.assistantText) {
      addBubble("msg-assistant", m.assistantText);
    } else if (m.status === "FAILED" && m.errorMessage) {
      addBubble("msg-error", m.errorMessage);
    }
    const active =
      m.status === "QUEUED" || m.status === "RUNNING";
    if (active) {
      attachStream(m.id);
    }
  }
}

function attachStream(messageId) {
  activeEsClose?.();
  setComposerEnabled(false);
  showTyping(true);
  setActivity("Working on your request…");
  assistantBubble = null;

  activeEsClose = subscribeMessageEvents(
    messageId,
    (ui) => handleUiEvent(ui),
    async () => {
      showTyping(false);
      setActivity("");
      setComposerEnabled(true);
      activeEsClose = null;
      try {
        const run = await getMessage(messageId);
        if (run.previewUrl || run.workspace?.previewUrl) {
          setPreview(run.previewUrl || run.workspace.previewUrl);
        }
        if (run.status === "FAILED" && run.errorMessage) {
          addBubble("msg-error", run.errorMessage);
        }
      } catch {
        /* ignore */
      }
    },
  );
}

function handleUiEvent(ui) {
  if (!ui || !ui.kind) return;

  switch (ui.kind) {
    case "activity":
      setActivity(ui.label);
      addBubble("msg-activity", ui.label);
      break;
    case "assistant_text":
      if (ui.append) {
        if (!assistantBubble) {
          assistantBubble = addBubble("msg-assistant", "");
        }
        assistantBubble.textContent += ui.text;
        scrollChat();
      } else if (ui.text) {
        assistantBubble = addBubble("msg-assistant", ui.text);
      }
      break;
    case "preview_ready":
      setPreview(ui.url);
      break;
    case "status":
      if (ui.status === "running" || ui.status === "queued") {
        setActivity("Working on your request…");
      }
      break;
    case "error":
      addBubble("msg-error", ui.message);
      break;
    default:
      break;
  }
}

async function onSend() {
  const text = composer.value.trim();
  if (!text) return;

  await ensureSession();
  addBubble("msg-user", text);
  composer.value = "";
  setComposerEnabled(false);

  const { ok, status, data } = await sendMessage(sessionId, text);

  if (status === 409 && data.messageId) {
    addBubble(
      "msg-system",
      "Still working on your last message. Showing live progress…",
    );
    attachStream(data.messageId);
    return;
  }

  if (!ok) {
    addBubble("msg-error", data.error ?? JSON.stringify(data));
    setComposerEnabled(true);
    return;
  }

  attachStream(data.messageId ?? data.id);
}

btnSend.addEventListener("click", () => void onSend());

composer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void onSend();
  }
});

composer.addEventListener("input", () => {
  btnSend.disabled = composer.disabled || !composer.value.trim();
});

btnNew.addEventListener("click", () => {
  activeEsClose?.();
  sessionId = null;
  localStorage.removeItem(STORAGE_SESSION);
  chat.innerHTML = "";
  previewFrame.src = "";
  previewFrame.classList.remove("loaded");
  previewBadge.hidden = true;
  setActivity("");
  showTyping(false);
  setComposerEnabled(true);
  addBubble("msg-system", "New chat — describe your site to get started.");
});

btnTogglePreview.addEventListener("click", () => {
  const collapsed = previewDock.classList.toggle("collapsed");
  btnTogglePreview.textContent = collapsed ? "Show" : "Hide";
  btnTogglePreview.setAttribute("aria-expanded", String(!collapsed));
});

async function init() {
  try {
    await ensureSession();
    await loadHistory();
    setComposerEnabled(true);
    btnSend.disabled = !composer.value.trim();
    if (!chat.children.length) {
      addBubble(
        "msg-system",
        "Hi! Describe what you want built or changed. Preview shows below when ready.",
      );
    }
  } catch (err) {
    addBubble("msg-error", String(err.message ?? err));
    setComposerEnabled(true);
  }
}

void init();