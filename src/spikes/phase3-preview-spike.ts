/**
 * Phase 3 — Preview URL after agent work.
 *
 *   npx tsx src/spikes/phase3-preview-spike.ts [siteId]
 */
import "dotenv/config";
import {
  getSiteSandbox,
  getPreviewUrl,
  refreshPreviewUrl,
} from "../sandbox/sandbox-manager.js";

async function main() {
  const siteId = process.argv[2] ?? "spike-phase2";
  const sandbox = await getSiteSandbox(siteId);
  const url = (await refreshPreviewUrl(sandbox)) ?? getPreviewUrl(sandbox);
  console.log(url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});