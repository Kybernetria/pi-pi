import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProtocolAgentExecutor } from "@kyvernitria/pi-protocol-minimal";
import { createDefaultPiSdkAgentExecutor } from "@kyvernitria/pi-protocol-pi-sdk/agent-session";
import { validateProtocolPackage } from "./validation.ts";
import type { BuildPackageInput, BuildPackageOutput } from "./schemas.ts";

export const PROTOCOL_BUILDER_AGENT_NAME = "protocol_builder";

export const PROTOCOL_BUILDER_SYSTEM_PROMPT = `You are pi-pi, an agent that builds Pi packages/extensions using pi-protocol 0.2.0.

The user gives you a request and a target directory. Build exactly what they ask for in that directory. Do not substitute generic placeholder behavior. If the request is unclear, say what clarification is needed instead of writing a fake package.

Protocol/framework rules:
- Use protocolVersion "0.2.0".
- Provide execution must be canonical: { "type": "handler", "handler": "..." } or { "type": "agent", "agent": "..." }.
- Do not use legacy top-level handler/agent shorthand.
- Pi extensions import from @earendil-works/pi-coding-agent, not @mariozechner/pi-coding-agent.
- Protocol runtime imports come from @kyvernitria/pi-protocol-minimal and, when needed, @kyvernitria/pi-protocol-pi-sdk.
- extension.ts must call ensureProtocolFabric(), fabric.unregister(nodeId), and registerProtocolManifest().
- Keep Pi-specific APIs in extension.ts or a small adapter layer. Put generic provide behavior in protocol handlers/agents.
- Cross-node calls must use the protocol fabric, never direct sibling package imports.
- Include package.json, pi.protocol.json, extension.ts, README.md, and implementation/tests/typecheck guidance as appropriate.

Write files directly in targetDir. Return a concise final report.`;

export function createProtocolBuilderAgentExecutor(): ProtocolAgentExecutor {
  return async (input: unknown): Promise<BuildPackageOutput> => {
    const normalized = normalizeInput(input);
    if ("status" in normalized) return normalized;

    const targetDir = path.resolve(normalized.targetDir as string);
    if (process.env.PI_PI_DISABLE_AGENT === "1") {
      return unsupported(targetDir, "PI_PI_DISABLE_AGENT=1");
    }

    await fs.mkdir(targetDir, { recursive: true });
    const before = await listFiles(targetDir);

    try {
      const executor = createDefaultPiSdkAgentExecutor({
        sessionOptions: { cwd: targetDir },
        systemPrompt: PROTOCOL_BUILDER_SYSTEM_PROMPT,
        systemPromptMode: "append",
        toPrompt: () => createPrompt(normalized.request, targetDir),
        toOutput: (text) => text.trim(),
      });

      const report = String(await executor(normalized));
      const after = await listFiles(targetDir);
      const filesWritten = after.filter((file) => !before.includes(file));
      const validation = await validateProtocolPackage(targetDir);

      return {
        status: validation.pass ? "completed" : "clarification_needed",
        summary: validation.pass
          ? "pi-pi agent completed the requested pi-protocol package/extension."
          : "pi-pi agent ran, but the result still needs pi-protocol compatibility fixes.",
        targetDir,
        filesWritten,
        diagnostics: [report, ...validation.issues.map((issue) => `${issue.rule}: ${issue.message} — ${issue.suggestedFix}`)].filter(Boolean),
        nextSteps: validation.pass
          ? ["Review generated files.", "Run npm install if needed.", "Run npm run typecheck and tests.", "Reload Pi and inspect the protocol registry."]
          : ["Review diagnostics, then ask pi-pi to repair the same targetDir."],
      };
    } catch (error) {
      return unsupported(targetDir, error instanceof Error ? error.message : String(error));
    }
  };
}

function normalizeInput(input: unknown): BuildPackageInput | BuildPackageOutput {
  if (!input || typeof input !== "object") {
    return { status: "clarification_needed", summary: "Provide { request, targetDir }." };
  }
  const value = input as Partial<BuildPackageInput>;
  if (typeof value.request !== "string" || !value.request.trim()) {
    return { status: "clarification_needed", summary: "build_package requires a non-empty request string." };
  }
  if (typeof value.targetDir !== "string" || !value.targetDir.trim()) {
    return { status: "clarification_needed", summary: "build_package requires targetDir so pi-pi knows where to build." };
  }
  return { request: value.request, targetDir: value.targetDir };
}

function unsupported(targetDir: string, diagnostic: string): BuildPackageOutput {
  return {
    status: "unsupported",
    summary: "I cannot build this package because a Pi SDK agent session is unavailable or disabled.",
    targetDir,
    diagnostics: [diagnostic],
    nextSteps: ["Run inside a Pi environment with AgentSession support, then invoke pi_pi.build_package again with request and targetDir."],
  };
}

function createPrompt(request: string, targetDir: string): string {
  return [
    `Target directory: ${targetDir}`,
    "User request:",
    request,
    "",
    "Build/adapt/repair the requested Pi protocol package in that directory now. Write files directly. Do not produce a generic scaffold unless the user explicitly asked only for a scaffold.",
  ].join("\n");
}

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(path.relative(root, full));
    }
  }
  await walk(root);
  return out.sort();
}
