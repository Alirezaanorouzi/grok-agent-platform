import type { Prisma } from "../generated/prisma/client.js";
import { getPrisma } from "../db.js";

const sseSubscribers = new Map<string, Set<(data: unknown) => void>>();

function jsonSafe(value: Prisma.InputJsonValue): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return { error: "non_serializable_event_payload" };
  }
}

export async function appendBuildEvent(
  buildRunId: string,
  type: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  const prisma = getPrisma();
  const safePayload = jsonSafe(payload);
  let event: Awaited<ReturnType<typeof prisma.buildEvent.create>>;
  for (let attempt = 0; attempt < 12; attempt++) {
    const max = await prisma.buildEvent.aggregate({
      where: { buildRunId },
      _max: { sequence: true },
    });
    const sequence = (max._max.sequence ?? 0) + 1;
    try {
      event = await prisma.buildEvent.create({
        data: {
          buildRunId,
          sequence,
          type,
          payload: safePayload,
        },
      });
      break;
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "";
      if (code === "P2002" && attempt < 11) continue;
      throw err;
    }
  }
  if (!event!) {
    throw new Error("Failed to append build event");
  }

  const subs = sseSubscribers.get(buildRunId);
  if (subs) {
    const message = {
      id: event.id,
      sequence: event.sequence,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
    };
    for (const send of subs) send(message);
  }
}

export function subscribeRunEvents(
  buildRunId: string,
  send: (data: unknown) => void,
): () => void {
  if (!sseSubscribers.has(buildRunId)) {
    sseSubscribers.set(buildRunId, new Set());
  }
  sseSubscribers.get(buildRunId)!.add(send);
  return () => {
    sseSubscribers.get(buildRunId)?.delete(send);
  };
}

export async function listBuildEvents(buildRunId: string) {
  const prisma = getPrisma();
  return prisma.buildEvent.findMany({
    where: { buildRunId },
    orderBy: { sequence: "asc" },
  });
}