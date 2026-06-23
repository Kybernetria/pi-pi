import path from "node:path";
import type { BuildPackageInput, BuildPackageOutput } from "./schemas.ts";
import { buildWithAgent } from "./agent-builder.ts";

export async function buildPackage(input: BuildPackageInput): Promise<BuildPackageOutput> {
  const request = input.request.trim();
  if (!request) {
    return { status: "clarification_needed", summary: "Tell pi-pi what package/extension to build." };
  }

  if (!input.targetDir?.trim()) {
    return {
      status: "clarification_needed",
      summary: "pi-pi needs targetDir. It is an agent-backed builder that writes the requested package/extension in the specified directory.",
      nextSteps: ["Invoke pi_pi.build_package with { request, targetDir } from the protocol fabric/tool."],
    };
  }

  return buildWithAgent({ ...input, targetDir: path.resolve(input.targetDir) });
}
