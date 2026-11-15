/** Client-side fallback if raw events are ever used without ?view=ui */
export function mapRawEvent(ev) {
  if (!ev || typeof ev !== "object") return [];
  if ("kind" in ev) return [ev];

  const type = ev.type ?? "";
  const payload = ev.payload ?? ev;

  if (type === "run.complete" && payload?.previewUrl) {
    return [
      { kind: "preview_ready", url: payload.previewUrl },
      payload.text
        ? { kind: "assistant_text", text: payload.text, append: false }
        : null,
    ].filter(Boolean);
  }

  if (type === "run.error") {
    return [{ kind: "error", message: payload?.message ?? "Failed" }];
  }

  return [];
}