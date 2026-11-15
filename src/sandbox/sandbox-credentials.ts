import type { Sandbox } from "@vercel/sandbox";
import { config } from "../config.js";

type GetOrCreateParams = Parameters<typeof Sandbox.getOrCreate>[0];

export function withSandboxCredentials<P extends GetOrCreateParams>(
  params: P,
): P {
  const { token, teamId, projectId } = config.vercel;
  if (token && teamId && projectId) {
    return { ...params, token, teamId, projectId };
  }
  return params;
}