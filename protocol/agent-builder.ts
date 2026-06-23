import { promises as fs } from "node:fs";
import path from "node:path";
import { createDefaultPiSdkAgentExecutor } from "@kyvernitria/pi-protocol-pi-sdk/agent-session";
import { validateProtocolPackage } from "./validation.ts";
import type { BuildPackageInput, BuildPackageOutput } from "./schemas.ts";

const BUILDER_SYSTEM_PROMPT = `You are pi-pi, an agent-backed builder for Pi packages/extensions that use pi-protocol 0.2.0.

Build exactly what the user asks for in the target directory. Do not substitute a generic placeholder implementation. If the request is ambiguous, ask for clarification instead of writing a fake package.

Protocol/framework requirements you must preserve:
- package name may be chosen from the request, but protocol package manifests use protocolVersion "0.2.0".
- Provide execution must be canonical: { "type": "handler", "handler": "..." } or { "type": "agent", "agent": "..." }.
- No legacy top-level handler/agent shorthand.
- Pi extensions import from @earendil-works/pi-coding-agent, not @mariozechner/pi-coding-agent.
- Protocol runtime imports come from @kyvernitria/pi-protocol-minimal and, when needed, @kyvernitria/pi-protocol-pi-sdk.
- The extension must call ensureProtocolFabric(), fabric.unregister(nodeId), and registerProtocolManifest().
- Pi-specific APIs belong in extension.ts or a small adapter layer. Generic provide behavior belongs in protocol handlers/agents.
- Cross-node calls must use the protocol fabric, never direct sibling package imports.
- Include package.json, pi.protocol.json, extension.ts, README.md, and implementation files/tests as appropriate.
- Run or document typecheck/test guidance.

Return a concise final report with files changed and any remaining diagnostics.`;

export async function buildWithAgent(input: BuildPackageInput): Promise<BuildPackageOutput> {
  const targetDir = path.resolve(input.targetDir ?? "");
  if (process.env.PI_PI_DISABLE_AGENT === "1") {
    return {
      status: "unsupported",
      summary: "I cannot build this package because a Pi SDK agent session is disabled in this environment.",
      targetDir,
      diagnostics: ["PI_PI_DISABLE_AGENT=1"],
      nextSteps: ["Run inside a Pi environment with AgentSession support and invoke again with request and targetDir."],
    };
  }
  await fs.mkdir(targetDir, { recursive: true });
  const before = await listFiles(targetDir);

  try {
    const executor = createDefaultPiSdkAgentExecutor({
      sessionOptions: { cwd: targetDir },
      systemPrompt: BUILDER_SYSTEM_PROMPT,
      systemPromptMode: "append",
      toPrompt: () => createPrompt(input.request, targetDir),
      toOutput: (text) => text.trim(),
    });

    const report = String(await executor({ request: input.request, targetDir }));
    const after = await listFiles(targetDir);
    const filesWritten = after.filter((file) => !before.includes(file));
    const validation = await validateProtocolPackage(targetDir);

    return {
      status: validation.pass ? "completed" : "clarification_needed",
      summary: validation.pass
        ? "Agent builder completed the requested pi-protocol package/extension."
        : "Agent builder ran, but the result still needs pi-protocol compatibility fixes.",
      targetDir,
      filesWritten,
      diagnostics: [report, ...validation.issues.map((issue) => `${issue.rule}: ${issue.message} — ${issue.suggestedFix}`)].filter(Boolean),
      nextSteps: validation.pass
        ? ["Review the generated files.", "Run npm install if needed.", "Run npm run typecheck and the package tests.", "Reload Pi and inspect the protocol registry."]
        : ["Review diagnostics and invoke pi-pi again with a repair request for the same targetDir."],
    };
  } catch (error) {
    return {
      status: "unsupported",
      summary: "I cannot build this package because a Pi SDK agent session is not available or failed before completing the build.",
      targetDir,
      diagnostics: [error instanceof Error ? error.message : String(error)],
      nextSteps: ["Run inside a Pi environment with @earendil-works/pi-coding-agent AgentSession support, then invoke again with request and targetDir."],
    };
  }
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
