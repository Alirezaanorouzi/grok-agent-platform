import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { BuildRunStatus, getPrisma } from "../db.js";
import {
  listBuildEvents,
  subscribeRunEvents,
} from "../events/event-store.js";
import { presentStoredEvent } from "../events/event-presenter.js";

export async function streamRunEvents(
  _app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  runId: string,
  uiView: boolean,
): Promise<void> {
  const prisma = getPrisma();
  const run = await prisma.buildRun.findUnique({ where: { id: runId } });
  if (!run) {
    reply.status(404).send({ error: "Not found" });
    return;
  }

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const writePayload = (data: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const existing = await listBuildEvents(runId);
  for (const ev of existing) {
    if (uiView) {
      for (const ui of presentStoredEvent(ev)) {
        writePayload(ui);
      }
    } else {
      writePayload(ev);
    }
  }

  if (
    run.status === BuildRunStatus.SUCCEEDED ||
    run.status === BuildRunStatus.FAILED
  ) {
    reply.raw.write("event: close\ndata: {}\n\n");
    reply.raw.end();
    return;
  }

  if (uiView) {
    writePayload({ kind: "status", status: run.status.toLowerCase() });
  }

  const unsubscribe = subscribeRunEvents(runId, (payload) => {
    const row = payload as { type: string; payload: unknown };
    if (uiView) {
      for (const ui of presentStoredEvent(row)) {
        writePayload(ui);
      }
    } else {
      writePayload(payload);
    }
  });

  const poll = setInterval(async () => {
    const fresh = await prisma.buildRun.findUnique({ where: { id: runId } });
    if (
      fresh &&
      (fresh.status === BuildRunStatus.SUCCEEDED ||
        fresh.status === BuildRunStatus.FAILED)
    ) {
      clearInterval(poll);
      unsubscribe();
      reply.raw.write("event: close\ndata: {}\n\n");
      reply.raw.end();
    }
  }, 2000);

  request.raw.on("close", () => {
    clearInterval(poll);
    unsubscribe();
  });
}