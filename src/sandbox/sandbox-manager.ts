import { Sandbox } from "@vercel/sandbox";
import { config, WORKSPACE_PATH, sandboxNameForSite } from "../config.js";
import { withSandboxCredentials } from "./sandbox-credentials.js";

const PREVIEW_PORT = 3000;

async function installGrok(sbx: Sandbox): Promise<void> {
  const version = config.grokVersion;
  const install = await sbx.runCommand({
    cmd: "bash",
    args: [
      "-c",
      `set -e
npm install -g @xai-official/grok@${version} 2>/dev/null || {
  curl -fsSL https://x.ai/cli/install.sh | bash
}
command -v grok`,
    ],
    sudo: true,
  });
  if (install.exitCode !== 0) {
    throw new Error(`Grok install failed: ${await install.stderr()}`);
  }
}

async function ensureWorkspaceDir(sbx: Sandbox): Promise<void> {
  await sbx.runCommand({
    cmd: "mkdir",
    args: ["-p", WORKSPACE_PATH],
  });
}

async function startDevServerIfReady(sbx: Sandbox): Promise<void> {
  const exists = await sbx.runCommand({
    cmd: "test",
    args: ["-f", `${WORKSPACE_PATH}/package.json`],
  });
  if (exists.exitCode !== 0) return;

  await sbx.runCommand({
    cmd: "bash",
    args: [
      "-c",
      "npm run dev -- --hostname 0.0.0.0 --port 3000",
    ],
    cwd: WORKSPACE_PATH,
    detached: true,
  });
}

async function waitForPreview(sbx: Sandbox, attempts = 30): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const ping = await sbx.runCommand({
      cmd: "bash",
      args: [
        "-c",
        "curl -sf http://127.0.0.1:3000 >/dev/null && echo up || true",
      ],
    });
    if ((await ping.stdout()).includes("up")) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export async function getSiteSandbox(siteId: string): Promise<Sandbox> {
  const name = sandboxNameForSite(siteId);

  const sandbox = await Sandbox.getOrCreate(
    withSandboxCredentials({
      name,
      image: "vercel/sandbox/node:24",
      ports: [PREVIEW_PORT],
      timeout: config.sandboxTimeoutMs,
      persistent: true,
      onCreate: async (sbx) => {
        await installGrok(sbx);
        await ensureWorkspaceDir(sbx);
      },
      onResume: async (sbx) => {
        await startDevServerIfReady(sbx);
      },
    }),
  );

  return sandbox;
}

export async function extendSandboxActivity(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.extendTimeout(config.sandboxTimeoutMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/exceed maximum execution timeout/i.test(message)) {
      return;
    }
    throw err;
  }
}

export function getPreviewUrl(sandbox: Sandbox): string {
  return sandbox.domain(PREVIEW_PORT);
}

export async function refreshPreviewUrl(sandbox: Sandbox): Promise<string | null> {
  const ready = await waitForPreview(sandbox);
  if (!ready) return null;
  return getPreviewUrl(sandbox);
}

export { WORKSPACE_PATH, PREVIEW_PORT, startDevServerIfReady, waitForPreview };