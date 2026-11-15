import type { Sandbox } from "@vercel/sandbox";
import { runGrokAcpInSandbox, type BuildEventHandler } from "./acp-transport.js";
import { buildFirstRunPrompt, buildFollowUpPrompt } from "./prompts.js";
import { refreshPreviewUrl } from "../sandbox/sandbox-manager.js";

export async function runAgentForWorkspace(
  sandbox: Sandbox,
  options: {
    userPrompt: string;
    isFirstRun: boolean;
    conversationSummary?: string | null;
    onEvent?: BuildEventHandler;
  },
): Promise<{ text: string; stopReason: string; previewUrl: string | null }> {
  const prompt = options.isFirstRun
    ? buildFirstRunPrompt(options.userPrompt)
    : buildFollowUpPrompt(options.userPrompt, options.conversationSummary);

  const result = await runGrokAcpInSandbox(
    sandbox,
    prompt,
    options.onEvent,
  );

  const previewUrl = await refreshPreviewUrl(sandbox);

  return {
    ...result,
    previewUrl,
  };
}