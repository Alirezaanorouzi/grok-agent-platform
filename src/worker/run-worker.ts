import { BuildRunStatus, getPrisma } from "../db.js";
import { config } from "../config.js";
import { appendBuildEvent } from "../events/event-store.js";
import {
  extendSandboxActivity,
  getSiteSandbox,
} from "../sandbox/sandbox-manager.js";
import { runAgentForWorkspace } from "../agent/grok-agent.js";

let workerRunning = false;

async function processRun(runId: string): Promise<void> {
  const prisma = getPrisma();
  const run = await prisma.buildRun.findUnique({
    where: { id: runId },
    include: { workspace: true },
  });
  if (!run) return;

  const siteId = run.workspace.id;

  await prisma.buildRun.update({
    where: { id: runId },
    data: { status: BuildRunStatus.RUNNING, startedAt: new Date() },
  });

  try {
    const sandbox = await getSiteSandbox(siteId);
    await extendSandboxActivity(sandbox);

    const priorSuccess = await prisma.buildRun.count({
      where: {
        workspaceId: run.workspaceId,
        status: BuildRunStatus.SUCCEEDED,
        id: { not: runId },
      },
    });

    let conversationSummary: string | null = null;
    if (priorSuccess > 0) {
      const lastSucceeded = await prisma.buildRun.findFirst({
        where: {
          workspaceId: run.workspaceId,
          status: BuildRunStatus.SUCCEEDED,
          id: { not: runId },
        },
        orderBy: { completedAt: "desc" },
      });
      if (lastSucceeded) {
        const completeEvent = await prisma.buildEvent.findFirst({
          where: { buildRunId: lastSucceeded.id, type: "run.complete" },
          orderBy: { sequence: "desc" },
        });
        if (completeEvent?.payload && typeof completeEvent.payload === "object") {
          const text = (completeEvent.payload as { text?: string }).text;
          if (text) {
            conversationSummary =
              text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
          }
        }
      }
    }

    const result = await runAgentForWorkspace(sandbox, {
      userPrompt: run.prompt,
      isFirstRun: priorSuccess === 0,
      conversationSummary,
      onEvent: async (ev) => {
        await appendBuildEvent(runId, ev.type, ev.payload as object);
      },
    });

    await prisma.workspace.update({
      where: { id: run.workspaceId },
      data: {
        previewUrl: result.previewUrl ?? undefined,
        lastActivityAt: new Date(),
      },
    });

    await prisma.buildRun.update({
      where: { id: runId },
      data: {
        status: BuildRunStatus.SUCCEEDED,
        completedAt: new Date(),
      },
    });

    await appendBuildEvent(runId, "run.complete", {
      stopReason: result.stopReason,
      text: result.text,
      previewUrl: result.previewUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.buildRun.update({
      where: { id: runId },
      data: {
        status: BuildRunStatus.FAILED,
        completedAt: new Date(),
        errorMessage: message,
      },
    });
    await appendBuildEvent(runId, "run.error", { message });
  }
}

async function tick(): Promise<void> {
  const prisma = getPrisma();
  const queued = await prisma.buildRun.findMany({
    where: { status: BuildRunStatus.QUEUED },
    orderBy: { createdAt: "asc" },
    take: 5,
    include: { workspace: true },
  });

  for (const run of queued) {
    const running = await prisma.buildRun.findFirst({
      where: {
        workspaceId: run.workspaceId,
        status: BuildRunStatus.RUNNING,
      },
    });
    if (running) continue;
    await processRun(run.id);
  }
}

export function startWorker(): void {
  if (workerRunning) return;
  workerRunning = true;

  const loop = async () => {
    if (!config.databaseUrl) return;
    try {
      await tick();
    } catch (e) {
      console.error("[worker]", e);
    }
    setTimeout(loop, config.workerPollMs);
  };

  void loop();
  console.log("[worker] started");
}