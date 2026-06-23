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
  };
}

function normalizeBuildInput(input: unknown): BuildPackageInput {
  if (!input || typeof input !== "object") {
    throw new Error("build_package input must be an object with request and targetDir");
  }
  const value = input as Partial<BuildPackageInput>;
  if (typeof value.request !== "string" || !value.request.trim()) {
    throw new Error("build_package requires a non-empty request string");
  }
  return {
    request: value.request,
    targetDir: typeof value.targetDir === "string" ? value.targetDir : undefined,
  };
}
