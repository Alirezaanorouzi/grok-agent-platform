# Sandbox lifecycle (MVP)

- **Sandbox** = named entity `site-{workspaceId}` (filesystem persists via snapshots).
- **Session** = one VM boot; default timeout 30 minutes (`SANDBOX_TIMEOUT_MS`); extend with `extendTimeout` during active runs.
- **Processes** (Grok, dev server) do **not** survive stop — `onResume` restarts `npm run dev` when `package.json` exists.
- **Snapshots** default to ~30 days retention — not a permanent code backup. Push to GitHub before pilot.

## Idle policy (MVP)

Manual: call `sandbox.stop()` when implementing idle timer later. Current MVP keeps sandbox warm while worker processes jobs and refreshes timeout on each run.