import path from "node:path";
import type { ProtocolAgentExecutor } from "@kybernetria/pi-protocol";
import { createDefaultPiSdkAgentExecutor, type CreateDefaultPiSdkAgentExecutorOptions } from "@kybernetria/pi-protocol/sdk/agent-session";
import { PROTOCOL_KNOWLEDGE } from "./knowledge.ts";
import type { BuildPackageInput, BuildPackageOutput } from "./schemas.ts";

export const PROTOCOL_BUILDER_AGENT_NAME = "protocol_builder";

export const PROTOCOL_BUILDER_SYSTEM_PROMPT = `You are pi-pi, a Pi SDK AgentSession exposed directly as a pi-protocol agent provide.

You help users and other agents work on pi-protocol compatible Pi packages/extensions in a target directory. Treat the caller's request as authoritative: build, adapt, repair, inspect, explain, clean up, or decline according to what was actually asked. Do not reinterpret unrelated maintenance requests as package construction or repair work.

If the caller asks you to build/adapt/repair a Pi protocol package, use these protocol/framework rules:
${PROTOCOL_KNOWLEDGE.trim()}

For package creation or repair, include package.json, pi.protocol.json, extension.ts, README.md, and implementation/tests/typecheck guidance as appropriate. Add protocol/handlers.ts only when the package declares handler-backed provides. Do not substitute generic placeholder behavior; if the request is unclear, return clarification_needed instead of writing a fake package.

When registering multiple agents from a manifest, use createPiSdkAgentExecutorsFromManifest() from @kybernetria/pi-protocol/sdk/agent-session. For a single custom agent executor, use createDefaultPiSdkAgentExecutor(). The system prompt from manifest.agents[agentName].systemPrompt.text is automatically honored by these helpers.

When changing files, operate directly in targetDir. Your final response must be either JSON matching:
{ "status": "completed" | "clarification_needed" | "unsupported" | "failed", "summary": string, "targetDir"?: string, "filesWritten"?: string[], "nextSteps"?: string[], "diagnostics"?: string[] }
or concise prose that can be used as the summary.`;

export type CreateProtocolBuilderAgentExecutorOptions = Pick<CreateDefaultPiSdkAgentExecutorOptions, "createSession" | "sessionOptions">;

/**
 * Clean exemplar: this factory returns the actual Pi SDK AgentSession-backed
 * ProtocolAgentExecutor. There is no per-invocation wrapper creating an inner
 * executor; fabric provenance, runtime streaming, session control, and aborts
 * flow directly into the SDK adapter.
 */
export function createProtocolBuilderAgentExecutor(
  options: CreateProtocolBuilderAgentExecutorOptions = {},
): ProtocolAgentExecutor {
  return createDefaultPiSdkAgentExecutor({
    ...options,
    systemPrompt: PROTOCOL_BUILDER_SYSTEM_PROMPT,
    systemPromptMode: "append",
    toPrompt: createPrompt,
    toOutput: parseBuildPackageOutput,
  });
}

export function createPrompt(input: unknown): string {
  const normalized = normalizeInput(input);
  const targetDir = path.resolve(normalized.targetDir);
  return [
    `Target directory: ${targetDir}`,
    "User request:",
    normalized.request,
    "",
    "Follow the user request for that target directory. Build/adapt/repair only when the request asks for that.",
    "When changing files, write directly in targetDir. Do not produce a generic scaffold unless the user explicitly asked only for a scaffold.",
    "Return final JSON with status, summary, targetDir, filesWritten, nextSteps, and diagnostics when possible.",
  ].join("\n");
}

export function parseBuildPackageOutput(text: string, input: unknown): BuildPackageOutput {
  const normalized = safeNormalizeInput(input);
  const parsed = parseJsonObject(extractJson(text));
  if (parsed && typeof parsed.status === "string" && typeof parsed.summary === "string") {
    return omitUndefined({
      status: isBuildStatus(parsed.status) ? parsed.status : "completed",
      summary: parsed.summary,
      targetDir: typeof parsed.targetDir === "string" ? parsed.targetDir : normalized?.targetDir,
      filesWritten: stringArray(parsed.filesWritten),
      nextSteps: stringArray(parsed.nextSteps),
      diagnostics: stringArray(parsed.diagnostics),
    });
  }

  return {
    status: "completed",
    summary: text.trim() || "pi-pi agent completed.",
    targetDir: normalized?.targetDir,
  };
}

function normalizeInput(input: unknown): Required<BuildPackageInput> {
  const normalized = safeNormalizeInput(input);
  if (!normalized) throw new Error("build_package requires { request: string, targetDir: string }.");
  return normalized;
}

function safeNormalizeInput(input: unknown): Required<BuildPackageInput> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Partial<BuildPackageInput>;
  if (typeof value.request !== "string" || !value.request.trim()) return undefined;
  if (typeof value.targetDir !== "string" || !value.targetDir.trim()) return undefined;
  return { request: value.request.trim(), targetDir: path.resolve(value.targetDir) };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) return fenced;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function isBuildStatus(value: string): value is BuildPackageOutput["status"] {
  return ["completed", "clarification_needed", "unsupported", "failed"].includes(value);
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(String) : undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
}
