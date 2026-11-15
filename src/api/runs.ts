import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BuildRunStatus, getPrisma } from "../db.js";
import { streamRunEvents } from "./run-events.js";

const runBody = z.object({
  prompt: z.string().min(1),
});

export async function registerRunRoutes(app: FastifyInstance) {
  app.post("/workspaces/:id/runs", async (request, reply) => {
    const prisma = getPrisma();
    const { id: workspaceId } = request.params as { id: string };
    const parsed = runBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      return reply.status(404).send({ error: "Workspace not found" });
    }

    const active = await prisma.buildRun.findFirst({
      where: {
        workspaceId,
        status: { in: [BuildRunStatus.QUEUED, BuildRunStatus.RUNNING] },
      },
    });
    if (active) {
      return reply.status(409).send({
        error: "A build is already active for this workspace",
        runId: active.id,
      });
    }

    const run = await prisma.buildRun.create({
      data: {
        workspaceId,
        prompt: parsed.data.prompt,
        status: BuildRunStatus.QUEUED,
      },
    });

    return reply.status(201).send(run);
  });

  app.get("/runs/:id", async (request, reply) => {
    const prisma = getPrisma();
    const { id } = request.params as { id: string };
    const run = await prisma.buildRun.findUnique({
      where: { id },
      include: { workspace: true },
    });
    if (!run) return reply.status(404).send({ error: "Not found" });
    return {
      ...run,
      previewUrl: run.workspace.previewUrl,
    };
  });

  app.get("/runs/:id/events", async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { view?: string };
    await streamRunEvents(app, request, reply, id, query.view === "ui");
  });
}