import * as acp from "@agentclientprotocol/sdk";
import type { Sandbox } from "@vercel/sandbox";
import { PassThrough, Readable } from "node:stream";
import { config, WORKSPACE_PATH } from "../config.js";

export type BuildEventHandler = (event: {
  type: string;
  payload: unknown;
}) => void | Promise<void>;

function autoAllowPermission(
  params: acp.RequestPermissionRequest,
): acp.RequestPermissionResponse {
  const allow = params.options.find(
    (o) => o.kind === "allow_once" || o.kind === "allow_always",
  );
  if (allow) {
    return {
      outcome: { outcome: "selected", optionId: allow.optionId },
    };
  }
  return { outcome: { outcome: "cancelled" } };
}

export async function runGrokAcpInSandbox(
  sandbox: Sandbox,
  prompt: string,
  onEvent?: BuildEventHandler,
): Promise<{ stopReason: string; text: string }> {
  if (!config.xaiApiKey) {
    throw new Error("XAI_API_KEY is required");
  }

  const agentOutput = new PassThrough();
  const agentErrors = new PassThrough();

  agentErrors.on("data", (chunk) => {
    if (process.env.GROK_ACP_LOG_STDERR === "1") {
      process.stderr.write(chunk);
    }
  });

  const command = await sandbox.runCommand({
    cmd: "grok",
    args: ["agent", "--always-approve", "stdio"],
    cwd: WORKSPACE_PATH,
    env: { XAI_API_KEY: config.xaiApiKey },
    stdin: true,
    detached: true,
    stdout: agentOutput,
    stderr: agentErrors,
  });

  const decoder = new TextDecoder();

  const toAgent = new WritableStream<Uint8Array>({
    write: async (chunk) => {
      const text = decoder.decode(chunk, { stream: true });
      if (text) await command.writeStdin(text);
    },
    close: async () => {
      const remaining = decoder.decode();
      if (remaining) await command.writeStdin(remaining);
      await command.closeStdin();
    },
  });

  const fromAgent = Readable.toWeb(agentOutput) as ReadableStream<Uint8Array>;
  const stream = acp.ndJsonStream(toAgent, fromAgent);

  const emitEvent = async (event: {
    type: string;
    payload: unknown;
  }): Promise<void> => {
    if (!onEvent) return;
    try {
      await onEvent(event);
    } catch (err) {
      console.error("[acp] build event handler failed:", err);
    }
  };

  try {
    return await acp
      .client({ name: "website-builder" })
      .onRequest(acp.methods.client.session.requestPermission, (ctx) =>
        Promise.resolve(autoAllowPermission(ctx.params)),
      )
      .connectWith(stream, async (ctx) => {
        await ctx.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
          },
        });

        return ctx
          .buildSession({
            cwd: WORKSPACE_PATH,
            mcpServers: [],
            _meta: { yoloMode: true },
          })
          .withSession(async (session) => {
            await session.prompt(prompt);

            let text = "";
            for (;;) {
              const message = await session.nextUpdate();
              if (message.kind === "session_update") {
                const update = message.update;
                await emitEvent({
                  type: update.sessionUpdate,
                  payload: update,
                });
                if (
                  update.sessionUpdate === "agent_message_chunk" &&
                  update.content?.type === "text"
                ) {
                  text += update.content.text ?? "";
                }
              } else {
                return {
                  text: text.trim(),
                  stopReason: message.stopReason ?? "end_turn",
                };
              }
            }
          });
      });
  } finally {
    await command.kill("SIGTERM").catch(() => {});
  }
}