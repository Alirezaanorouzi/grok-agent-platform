const API = location.origin;

export async function createSession(userId) {
  const res = await fetch(`${API}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? JSON.stringify(data));
  return data;
}

export async function getSession(sessionId) {
  const res = await fetch(`${API}/sessions/${sessionId}`);
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function listSessionMessages(sessionId) {
  const res = await fetch(`${API}/sessions/${sessionId}/messages`);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.messages ?? [];
}

export async function sendMessage(sessionId, content) {
  const res = await fetch(`${API}/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export function subscribeMessageEvents(messageId, onData, onClose) {
  const url = `${API}/messages/${messageId}/events?view=ui`;
  const es = new EventSource(url);

  es.onmessage = (ev) => {
    try {
      onData(JSON.parse(ev.data));
    } catch {
      onData(ev.data);
    }
  };

  es.addEventListener("close", () => {
    es.close();
    onClose?.();
  });

  es.onerror = () => {
    es.close();
    onClose?.();
  };

  return () => es.close();
}

export async function getMessage(messageId) {
  const res = await fetch(`${API}/runs/${messageId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}