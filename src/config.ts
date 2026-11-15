import "dotenv/config";

export const WORKSPACE_PATH = "/vercel/sandbox/workspace";

export const config = {
  port: Number(process.env.PORT ?? 8788),
  databaseUrl: process.env.DATABASE_URL ?? "",
  xaiApiKey: process.env.XAI_API_KEY ?? "",
  grokVersion: process.env.GROK_VERSION ?? "latest",
  templateRepoUrl:
    process.env.TEMPLATE_REPO_URL ??
    "https://github.com/builder1org/builder-default-g38q8azz.git",
  sandboxTimeoutMs: Number(process.env.SANDBOX_TIMEOUT_MS ?? 30 * 60 * 1000),
  workerPollMs: Number(process.env.WORKER_POLL_MS ?? 2000),
  vercel: {
    token: process.env.VERCEL_TOKEN,
    teamId: process.env.VERCEL_TEAM_ID,
    projectId: process.env.VERCEL_PROJECT_ID,
  },
};

export function sandboxNameForSite(siteId: string): string {
  return `site-${siteId}`;
}