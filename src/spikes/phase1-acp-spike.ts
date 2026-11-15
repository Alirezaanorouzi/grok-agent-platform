/**
 * Phase 1 — ACP STDIO via Vercel Sandbox (requires Vercel + XAI credentials).
 *
 * Usage:
 *   npx tsx src/spikes/phase1-acp-spike.ts [siteId]
 */
import "dotenv/config";
import { runGrokAcpInSandbox } from "../agent/acp-transport.js";
import { getSiteSandbox, WORKSPACE_PATH } from "../sandbox/sandbox-manager.js";

async function main() {
  const siteId = process.argv[2] ?? "spike-phase1";
  const sandbox = await getSiteSandbox(siteId);
  await sandbox.runCommand({
    cmd: "mkdir",
    args: ["-p", WORKSPACE_PATH],
  });

  console.error(`Workspace: ${WORKSPACE_PATH}`);

  const result = await runGrokAcpInSandbox(
    sandbox,
    "Reply with exactly: ACP spike OK",
    (ev) => console.error("[event]", ev.type),
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});