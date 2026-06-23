import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ProtocolFabric, ProtocolHandler } from "@kyvernitria/pi-protocol-minimal";
import { buildPackage } from "./builder.ts";
import type { BuildPackageInput } from "./schemas.ts";

export interface CreateHandlersOptions {
  pi?: ExtensionAPI;
  fabric?: ProtocolFabric;
}

export function createHandlers(_options: CreateHandlersOptions = {}): Record<string, ProtocolHandler> {
  return {
    build_package: async (input: unknown) => buildPackage(normalizeBuildInput(input)),
    chat: async (input: unknown) => buildPackage(normalizeChatInput(input)),
    // Compatibility alias for callers that still know the old handler name. It is not exposed as a public provide.
    chat_pi_pi: async (input: unknown) => buildPackage(normalizeChatInput(input)),
  };
}

function normalizeBuildInput(input: unknown): BuildPackageInput {
  if (!input || typeof input !== "object") {
    throw new Error("build_package input must be an object with request");
  }
  const value = input as Partial<BuildPackageInput>;
  if (typeof value.request !== "string" || !value.request.trim()) {
    throw new Error("build_package requires a non-empty request string");
  }
  return {
    request: value.request,
    targetDir: typeof value.targetDir === "string" ? value.targetDir : undefined,
    applyChanges: typeof value.applyChanges === "boolean" ? value.applyChanges : false,
    mode: isBuildMode(value.mode) ? value.mode : undefined,
  };
}

function normalizeChatInput(input: unknown): BuildPackageInput {
  if (!input || typeof input !== "object") {
    throw new Error("chat input must be an object with message or request");
  }
  const value = input as { message?: unknown; request?: unknown; targetDir?: unknown; applyChanges?: unknown; mode?: unknown };
  const request = typeof value.request === "string" ? value.request : typeof value.message === "string" ? value.message : "";
  if (!request.trim()) throw new Error("chat requires input.message or input.request");
  return {
    request,
    targetDir: typeof value.targetDir === "string" ? value.targetDir : undefined,
    applyChanges: typeof value.applyChanges === "boolean" ? value.applyChanges : false,
    mode: isBuildMode(value.mode) ? value.mode : undefined,
  };
}

function isBuildMode(value: unknown): value is BuildPackageInput["mode"] {
  return value === "new" || value === "adapt" || value === "repair" || value === "explain";
}
