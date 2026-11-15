import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { config } from "./config.js";
import { registerWorkspaceRoutes } from "./api/workspaces.js";
import { registerRunRoutes } from "./api/runs.js";
import { registerSessionRoutes } from "./api/sessions.js";
import { startWorker } from "./worker/run-worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = Fastify({ logger: true });

  const publicDir = path.join(__dirname, "..", "public");

  app.get("/", async (_req, reply) => {
    const html = await readFile(path.join(publicDir, "index.html"), "utf8");
    return reply.type("text/html").send(html);
  });

  app.get("/styles/:file", async (request, reply) => {
    const { file } = request.params as { file: string };
    if (!/^[\w.-]+\.css$/.test(file)) {
      return reply.status(400).send({ error: "Invalid path" });
    }
    const content = await readFile(
      path.join(publicDir, "styles", file),
      "utf8",
    );
    return reply.type("text/css").send(content);
  });

  app.get("/js/:file", async (request, reply) => {
    const { file } = request.params as { file: string };
    if (!/^[\w.-]+\.js$/.test(file)) {
      return reply.status(400).send({ error: "Invalid path" });
    }
    const content = await readFile(path.join(publicDir, "js", file), "utf8");
    return reply.type("application/javascript").send(content);
  });

  app.get("/health", async () => ({
    ok: true,
    database: Boolean(config.databaseUrl),
  }));

  await registerWorkspaceRoutes(app);
  await registerRunRoutes(app);
  await registerSessionRoutes(app);

  if (config.databaseUrl) {
    startWorker();
  } else {
    app.log.warn("DATABASE_URL unset — worker disabled");
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`API http://127.0.0.1:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});