export type UiEvent =
  | { kind: "activity"; label: string; rawType?: string }
  | { kind: "assistant_text"; text: string; append?: boolean }
  | { kind: "status"; status: string; detail?: string }
  | { kind: "preview_ready"; url: string }
  | { kind: "error"; message: string };

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function activityLabel(type: string, payload: unknown): string | null {
  const p = asRecord(payload);
  if (type === "run.complete") return "Build finished";
  if (type === "run.error") return "Something went wrong";

  const sessionUpdate =
    p?.sessionUpdate ?? (type !== "session/update" ? type : undefined);
  const updateType = String(sessionUpdate ?? type);

  if (updateType === "agent_message_chunk") return null;

  if (updateType.includes("tool") || updateType === "tool_call") {
    const name =
      (p?.title as string) ??
      (asRecord(p?.toolCall)?.name as string) ??
      "Tool";
    return `Using ${name}`;
  }

  if (updateType === "available_commands_update") return null;

  const map: Record<string, string> = {
    "session/update": "Working…",
    terminal_output: "Running a command",
    file_edit: "Editing files",
    file_write: "Writing files",
    command_execution: "Running a command",
  };

  if (map[updateType]) return map[updateType];

  if (updateType && updateType !== "session/update") {
    return updateType.replace(/_/g, " ");
  }
  return null;
}

export function presentBuildEvent(
  type: string,
  payload: unknown,
): UiEvent[] {
  const p = asRecord(payload);

  if (type === "run.complete") {
    const out: UiEvent[] = [
      { kind: "status", status: "succeeded", detail: "Done" },
    ];
    const text = typeof p?.text === "string" ? p.text.trim() : "";
    if (text) out.push({ kind: "assistant_text", text, append: false });
    const url = typeof p?.previewUrl === "string" ? p.previewUrl : "";
    if (url) out.push({ kind: "preview_ready", url });
    return out;
  }

  if (type === "run.error") {
    const message =
      typeof p?.message === "string" ? p.message : "Build failed";
    return [
      { kind: "status", status: "failed", detail: message },
      { kind: "error", message },
    ];
  }

  const updateType = String(p?.sessionUpdate ?? type);
  if (updateType === "agent_message_chunk") {
    const content = asRecord(p?.content);
    if (content?.type === "text" && typeof content.text === "string") {
      const chunk = content.text;
      if (chunk) {
        return [{ kind: "assistant_text", text: chunk, append: true }];
      }
    }
    return [];
  }

  const label = activityLabel(type, payload);
  if (label) {
    return [{ kind: "activity", label, rawType: updateType }];
  }

  return [];
}

export function presentStoredEvent(ev: {
  type: string;
  payload: unknown;
}): UiEvent[] {
  return presentBuildEvent(ev.type, ev.payload);
}