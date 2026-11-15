import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPrisma } from "../db.js";
import { config, sandboxNameForSite } from "../config.js";

const createBody = z.object({
  userId: z.string().min(1),
  templateRepoUrl: z.string().url().optional(),
});

export async function registerWorkspaceRoutes(app: FastifyInstance) {
  app.post("/workspaces", async (request, reply) => {
    const prisma = getPrisma();
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const templateRepoUrl =
      parsed.data.templateRepoUrl ?? config.templateRepoUrl;

    const workspace = await prisma.workspace.create({
      data: {
        userId: parsed.data.userId,
        sandboxName: sandboxNameForSite("pending"),
        templateRepoUrl,
      },
    });

    const sandboxName = sandboxNameForSite(workspace.id);
    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { sandboxName },
    });

    return reply.status(201).send(updated);
  });

  app.get("/workspaces/:id", async (request, reply) => {
    const prisma = getPrisma();
    const { id } = request.params as { id: string };
    const workspace = await prisma.workspace.findUnique({ where: { id } });
    if (!workspace) return reply.status(404).send({ error: "Not found" });
    return workspace;
  });
}