import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BuildRunStatus, getPrisma } from "../db.js";
import { config, sandboxNameForSite } from "../config.js";
import { listBuildEvents } from "../events/event-store.js";
import { streamRunEvents } from "./run-events.js";

const createSessionBody = z.object({
  userId: z.string().min(1).optional(),
  title: z.string().max(200).optional(),
});

const messageBody = z.object({
  content: z.string().min(1),
});

function defaultUserId(): string {
  return "demo-user";
}

export async function registerSessionRoutes(app: FastifyInstance) {
  app.post("/sessions", async (request, reply) => {
    const prisma = getPrisma();
    const parsed = createSessionBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const userId = parsed.data.userId ?? defaultUserId();
    const templateRepoUrl = config.templateRepoUrl;

    const workspace = await prisma.workspace.create({
      data: {
        userId,
        sandboxName: sandboxNameForSite("pending"),
        templateRepoUrl,
      },
    });

    const sandboxName = sandboxNameForSite(workspace.id);
    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { sandboxName },
    });

    return reply.status(201).send({
      id: updated.id,
      userId: updated.userId,
      title: parsed.data.title ?? null,
      previewUrl: updated.previewUrl,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  });

  app.get("/sessions", async (request, reply) => {
    const prisma = getPrisma();
    const { userId } = request.query as { userId?: string };
    const uid = userId?.trim() || defaultUserId();

    const sessions = await prisma.workspace.findMany({
      where: { userId: uid },
      orderBy: { lastActivityAt: "desc" },
      take: 20,
    });

    return reply.send(
      sessions.map((s) => ({
        id: s.id,
        userId: s.userId,
        previewUrl: s.previewUrl,
        status: s.status,
        lastActivityAt: s.lastActivityAt,
        createdAt: s.createdAt,
      })),
    );
  });

  app.get("/sessions/:id", async (request, reply) => {
    const prisma = getPrisma();
    const { id } = request.params as { id: string };
    const workspace = await prisma.workspace.findUnique({ where: { id } });
    if (!workspace) return reply.status(404).send({ error: "Not found" });

    return {
      id: workspace.id,
      userId: workspace.userId,
      previewUrl: workspace.previewUrl,
      status: workspace.status,
      lastActivityAt: workspace.lastActivityAt,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  });

  app.get("/sessions/:id/messages", async (request, reply) => {
    const prisma = getPrisma();
    const { id: sessionId } = request.params as { id: string };

    const workspace = await prisma.workspace.findUnique({
      where: { id: sessionId },
    });
    if (!workspace) return reply.status(404).send({ error: "Not found" });

    const runs = await prisma.buildRun.findMany({
      where: { workspaceId: sessionId },
      orderBy: { createdAt: "asc" },
    });

    const messages = await Promise.all(
      runs.map(async (run) => {
        const events = await listBuildEvents(run.id);
        const complete = events.find((e) => e.type === "run.complete");
        const errorEv = events.find((e) => e.type === "run.error");
        let assistantText: string | null = null;
        if (complete?.payload && typeof complete.payload === "object") {
          const p = complete.payload as { text?: string };
          assistantText = p.text ?? null;
        }
        let errorMessage = run.errorMessage;
        if (!errorMessage && errorEv?.payload && typeof errorEv.payload === "object") {
          const p = errorEv.payload as { message?: string };
          errorMessage = p.message ?? null;
        }

        return {
          id: run.id,
          sessionId: run.workspaceId,
          role: "user" as const,
          content: run.prompt,
          status: run.status,
          assistantText,
          errorMessage,
          createdAt: run.createdAt,
          completedAt: run.completedAt,
        };
      }),
    );

    return { sessionId, messages };
  });

  app.post("/sessions/:id/messages", async (request, reply) => {
    const prisma = getPrisma();
    const { id: sessionId } = request.params as { id: string };
    const parsed = messageBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: sessionId },
    });
    if (!workspace) {
      return reply.status(404).send({ error: "Session not found" });
    }

    const active = await prisma.buildRun.findFirst({
      where: {
        workspaceId: sessionId,
        status: { in: [BuildRunStatus.QUEUED, BuildRunStatus.RUNNING] },
      },
    });
    if (active) {
      return reply.status(409).send({
        error: "A build is already active for this session",
        messageId: active.id,
        runId: active.id,
      });
    }

    const run = await prisma.buildRun.create({
      data: {
        workspaceId: sessionId,
        prompt: parsed.data.content,
        status: BuildRunStatus.QUEUED,
      },
    });

    return reply.status(201).send({
      id: run.id,
      messageId: run.id,
      runId: run.id,
      sessionId: run.workspaceId,
      content: run.prompt,
      status: run.status,
      createdAt: run.createdAt,
    });
  });

  app.get("/messages/:id/events", async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { view?: string };
    await streamRunEvents(app, request, reply, id, query.view === "ui");
  });
}