/**
 * Phase 2 — Agent clones template and builds (long-running).
 *
 *   npx tsx src/spikes/phase2-agent-spike.ts [siteId] "your prompt"
 */
import "dotenv/config";
import { getSiteSandbox } from "../sandbox/sandbox-manager.js";
import { runAgentForWorkspace } from "../agent/grok-agent.js";

async function main() {
  const siteId = process.argv[2] ?? "spike-phase2";
  const userPrompt =
    process.argv.slice(3).join(" ") ||
    "Clone the template if empty, run npm install and npm run build, then summarize package.json name.";

  const sandbox = await getSiteSandbox(siteId);

  const result = await runAgentForWorkspace(sandbox, {
    userPrompt,
    isFirstRun: true,
    onEvent: (ev) => console.error("[event]", ev.type),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});