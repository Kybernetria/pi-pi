import { promises as fs } from "node:fs";
import path from "node:path";
import { explainRequiredFiles, modernContractChecklist, PROTOCOL_KNOWLEDGE } from "./knowledge.ts";
import type { BuildMode, BuildPackageInput, BuildPackageOutput, GeneratedPackageSpec } from "./schemas.ts";
import { renderGeneratedPackage, renderJson, renderPackageForAnalysis } from "./templates.ts";
import { validateProtocolPackage } from "./validation.ts";
import { analyzeRequest } from "./request-analysis.ts";
import { tryAgentBackedBuild } from "./agent-builder.ts";

export async function buildPackage(input: BuildPackageInput): Promise<BuildPackageOutput> {
  const request = input.request.trim();
  if (!request) {
    return { status: "clarification_needed", summary: "Please provide a package-building, adaptation, repair, or explanation request." };
  }
  if (input.applyChanges && !input.targetDir) {
    return { status: "clarification_needed", summary: "applyChanges: true requires targetDir so file writes are explicit and bounded." };
  }

  const mode = input.mode ?? inferMode(request);
  if (mode === "explain") return explainPackage(request);
  if (mode === "repair") return repairPackage(input);
  if (mode === "adapt") return adaptPackage(input);
  return newPackage(input);
}

function explainPackage(_request: string): BuildPackageOutput {
  return {
    status: "completed",
    summary: explainRequiredFiles(),
    nextSteps: modernContractChecklist(),
  };
}

async function repairPackage(input: BuildPackageInput): Promise<BuildPackageOutput> {
  if (!input.targetDir) {
    return {
      status: "clarification_needed",
      summary: "Repair mode needs targetDir. I can then validate the package and provide exact fixes; set applyChanges true only when you want safe repairs written.",
      nextSteps: ["Invoke pi_pi.build_package with { request, mode: 'repair', targetDir, applyChanges: false } first."],
    };
  }

  const before = await validateProtocolPackage(input.targetDir);
  if (!input.applyChanges || before.pass) {
    return {
      status: before.pass ? "completed" : "clarification_needed",
      summary: before.pass
        ? "Package already conforms to the lightweight pi-protocol 0.2.0 checks."
        : `Package needs ${before.issues.length} repair(s) for pi-protocol 0.2.0 compatibility.`,
      targetDir: before.packageDir,
      diagnostics: before.issues.map((issue) => `${issue.rule}: ${issue.message} — ${issue.suggestedFix}`),
      nextSteps: before.pass
        ? ["Run npm run typecheck.", "Load/reload the Pi extension and inspect the protocol registry."]
        : ["Apply the listed fixes or invoke with applyChanges: true for safe mechanical repairs.", "Run npm run typecheck."],
    };
  }

  const filesWritten = await applySafeRepairs(before.packageDir);
  const after = await validateProtocolPackage(before.packageDir);
  return {
    status: after.pass ? "completed" : "clarification_needed",
    summary: after.pass
      ? "Applied safe repairs and the package now passes lightweight pi-protocol 0.2.0 checks."
      : `Applied safe repairs, but ${after.issues.length} issue(s) still need manual work.`,
    targetDir: after.packageDir,
    filesWritten,
    diagnostics: after.issues.map((issue) => `${issue.rule}: ${issue.message} — ${issue.suggestedFix}`),
    nextSteps: ["Review the diff.", "Run npm run typecheck.", "Reload the Pi extension and inspect the protocol registry."],
  };
}

async function adaptPackage(input: BuildPackageInput): Promise<BuildPackageOutput> {
  if (!input.targetDir) {
    return {
      status: "clarification_needed",
      summary: "Adapt mode needs targetDir for the existing Pi extension. I will inspect it, propose a protocol 0.2.0 surface, and only write safe changes when applyChanges is true.",
      nextSteps: ["Provide targetDir.", "Identify the capability that should become the public provide.", "Default to applyChanges: false for a reviewable plan."],
    };
  }
  const validation = await validateProtocolPackage(input.targetDir);
  const files = await listInterestingFiles(validation.packageDir);
  const diagnostics = validation.issues.map((issue) => `${issue.rule}: ${issue.message} — ${issue.suggestedFix}`);

  if (input.applyChanges) return repairPackage({ ...input, mode: "repair" });

  return {
    status: validation.pass ? "completed" : "clarification_needed",
    summary: validation.pass
      ? "The existing package already looks like a modern protocol package; adaptation should focus on exposing any additional real capabilities as provides."
      : "Adaptation plan prepared from the existing package. I did not write files because applyChanges is false.",
    targetDir: validation.packageDir,
    diagnostics: [`Detected files: ${files.join(", ") || "none"}`, ...diagnostics],
    nextSteps: [
      "Map each existing user-visible behavior to a provide name, inputSchema, outputSchema, and handler/agent execution.",
      "Keep Pi-specific hooks/commands in extension.ts and generic protocol behavior in protocol/handlers.ts.",
      "Use fabric.invoke() for cross-node calls; do not directly import sibling protocol packages.",
      "Invoke repair mode with applyChanges: true only for safe mechanical protocol 0.2.0 fixes.",
    ],
  };
}

async function newPackage(input: BuildPackageInput): Promise<BuildPackageOutput> {
  const analysis = analyzeRequest(input.request);
  const generated = renderPackageForAnalysis(analysis, input.request);

  if (!generated) {
    const agentResult = await tryAgentBackedBuild(input);
    if (agentResult) return agentResult;
    return {
      status: "unsupported",
      summary: "I cannot yet implement this behavior automatically without an available agent-backed builder.",
      targetDir: input.targetDir,
      diagnostics: [
        `No deterministic template matched: ${analysis.reason}.`,
        "Known deterministic families: markdown summarizer, project review agent, simple explicitly handler-backed package, plus narrow request-specific Pi extension examples covered by tests."
      ],
      nextSteps: ["Clarify the requested provides, Pi hooks, schemas, and file effects, or enable a trusted Pi SDK agent-backed builder."],
    };
  }

  const files = Object.keys(generated.files).sort();
  if (!input.applyChanges) {
    return {
      status: "completed",
      summary: `Plan for ${analysis.packageName}: generate behavior-specific ${analysis.family} package exposing ${analysis.nodeId}.${analysis.provideName}.`,
      targetDir: input.targetDir,
      nextSteps: [
        "Review the inferred package name, nodeId, provide name, schemas, and behavior-specific implementation.",
        "Invoke again with targetDir and applyChanges: true to write files.",
        "Run npm install and npm run typecheck in the generated package.",
      ],
      diagnostics: ["No files written because applyChanges was false.", `Files previewed: ${files.join(", ")}`, compactKnowledgeDigest()],
      plan: files.map((file) => `write ${file}`),
      filePreviews: previewFiles(generated.files),
    };
  }

  const targetDir = path.resolve(input.targetDir!);
  const filesWritten: string[] = [];
  for (const [relativePath, content] of Object.entries(generated.files)) {
    const fullPath = path.join(targetDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
    filesWritten.push(relativePath);
  }
  const validation = await validateProtocolPackage(targetDir);

  return {
    status: validation.pass ? "completed" : "failed",
    summary: validation.pass
      ? `Generated ${analysis.packageName} as a behavior-specific pi-protocol 0.2.0 package exposing ${analysis.nodeId}.${analysis.provideName}.`
      : `Generated files, but validation found ${validation.issues.length} issue(s).`,
    targetDir,
    filesWritten: filesWritten.sort(),
    diagnostics: validation.issues.map((issue) => `${issue.rule}: ${issue.message}`),
    nextSteps: ["Run npm install if dependencies are not present.", "Run npm run typecheck.", "Install/load the package in Pi, reload, and inspect the protocol registry."],
  };
}

function inferMode(request: string): BuildMode {
  const lower = request.toLowerCase();
  if (/\b(explain|required files|what files|contract)\b/.test(lower)) return "explain";
  if (/\b(repair|fix|conform|validate)\b/.test(lower)) return "repair";
  if (/\b(adapt|migrate|convert|existing|brownfield)\b/.test(lower)) return "adapt";
  return "new";
}

async function applySafeRepairs(root: string): Promise<string[]> {
  const written = new Set<string>();
  const packagePath = path.join(root, "package.json");
  const manifestPath = path.join(root, "pi.protocol.json");
  const extensionPath = path.join(root, "extension.ts");
  const handlersPath = path.join(root, "protocol", "handlers.ts");

  const packageJson = await readJsonObject(packagePath);
  if (packageJson) {
    packageJson.type ??= "module";
    packageJson.exports ??= "./extension.ts";
    packageJson.pi = typeof packageJson.pi === "object" && packageJson.pi ? packageJson.pi : {};
    (packageJson.pi as Record<string, unknown>).extensions = ["./extension.ts"];
    packageJson.dependencies = { ...((packageJson.dependencies as object | undefined) ?? {}), "@kyvernitria/pi-protocol-minimal": "^0.2.0" };
    packageJson.peerDependencies = { ...((packageJson.peerDependencies as object | undefined) ?? {}), "@earendil-works/pi-coding-agent": "*" };
    await fs.writeFile(packagePath, renderJson(packageJson), "utf8");
    written.add("package.json");
  }

  const manifest = await readJsonObject(manifestPath);
  if (manifest) {
    manifest.protocolVersion = "0.2.0";
    if (Array.isArray(manifest.provides)) {
      for (const provide of manifest.provides as Record<string, unknown>[]) {
        if (!provide.execution && typeof provide.handler === "string") provide.execution = { type: "handler", handler: provide.handler };
        if (!provide.execution && typeof provide.agent === "string") provide.execution = { type: "agent", agent: provide.agent };
        delete provide.handler;
        delete provide.agent;
      }
    }
    await fs.writeFile(manifestPath, renderJson(manifest), "utf8");
    written.add("pi.protocol.json");
  }

  if (!(await exists(extensionPath)) && manifest?.nodeId) {
    await fs.writeFile(extensionPath, minimalExtension(String(manifest.nodeId)), "utf8");
    written.add("extension.ts");
  }
  if (!(await exists(handlersPath)) && manifest && Array.isArray(manifest.provides)) {
    const handlers = (manifest.provides as { execution?: { type?: string; handler?: string } }[]).filter((p) => p.execution?.type === "handler" && p.execution.handler).map((p) => p.execution!.handler!);
    if (handlers.length) {
      await fs.mkdir(path.dirname(handlersPath), { recursive: true });
      await fs.writeFile(handlersPath, minimalHandlers(handlers), "utf8");
      written.add("protocol/handlers.ts");
    }
  }
  return [...written].sort();
}

function minimalExtension(nodeId: string): string {
  return `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";\nimport { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";\nimport manifestJson from "./pi.protocol.json" with { type: "json" };\nimport { createHandlers } from "./protocol/handlers.ts";\n\nconst manifest = manifestJson as PiProtocolManifest;\n\nexport default function extension(_pi: ExtensionAPI): void {\n  const fabric = ensureProtocolFabric();\n  fabric.unregister("${nodeId}");\n  registerProtocolManifest(fabric, { manifest, handlers: createHandlers({ fabric }) });\n}\n`;
}

function minimalHandlers(handlers: string[]): string {
  return `import type { ProtocolHandler } from "@kyvernitria/pi-protocol-minimal";\n\nexport function createHandlers(): Record<string, ProtocolHandler> {\n  return {\n${handlers.map((handler) => `    ${handler}: async () => { throw new Error("Handler ${handler} still needs the package-specific implementation after protocol repair."); },`).join("\n")}\n  };\n}\n`;
}

async function listInterestingFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const rel of ["package.json", "pi.protocol.json", "extension.ts", "protocol/handlers.ts", "README.md"]) {
    if (await exists(path.join(root, rel))) out.push(rel);
  }
  return out;
}

async function exists(filePath: string): Promise<boolean> { try { await fs.access(filePath); return true; } catch { return false; } }
async function readJsonObject(filePath: string): Promise<Record<string, unknown> | undefined> { try { const value = JSON.parse(await fs.readFile(filePath, "utf8")); return value && typeof value === "object" && !Array.isArray(value) ? value : undefined; } catch { return undefined; } }

function previewFiles(files: Record<string, string>): string[] {
  return Object.entries(files).map(([file, content]) => `${file}:\n${content.slice(0, 1200)}`);
}

function compactKnowledgeDigest(): string {
  return PROTOCOL_KNOWLEDGE.split("\n").filter((line) => line.trim().startsWith("-")).slice(0, 5).join(" ");
}

// Kept for source compatibility with older tests/imports that called renderGeneratedPackage through inferred specs.
export function inferGeneratedPackageSpec(request: string): GeneratedPackageSpec {
  const analysis = analyzeRequest(request);
  return {
    packageName: analysis.packageName,
    nodeId: analysis.nodeId,
    purpose: `Protocol package generated for: ${request.slice(0, 140)}`,
    provideName: analysis.provideName,
    provideDescription: `Handle ${analysis.provideName.replaceAll("_", " ")} requests.`,
    handlerName: analysis.provideName,
    slashCommandName: `${analysis.nodeId}.${analysis.provideName}`,
  };
}

void renderGeneratedPackage;
