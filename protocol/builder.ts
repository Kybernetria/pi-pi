import { promises as fs } from "node:fs";
import path from "node:path";
import { explainRequiredFiles, modernContractChecklist, PROTOCOL_KNOWLEDGE } from "./knowledge.ts";
import type { BuildMode, BuildPackageInput, BuildPackageOutput, GeneratedPackageSpec } from "./schemas.ts";
import { renderGeneratedPackage } from "./templates.ts";
import { validateProtocolPackage } from "./validation.ts";

export async function buildPackage(input: BuildPackageInput): Promise<BuildPackageOutput> {
  const request = input.request.trim();
  if (!request) {
    return { status: "clarification_needed", summary: "Please provide a package-building, adaptation, repair, or explanation request." };
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
      summary: "Repair mode needs targetDir. I can then validate the package and provide exact fixes; set applyChanges true only when you want files written.",
      nextSteps: ["Invoke pi_pi.build_package with { request, mode: 'repair', targetDir, applyChanges: false } first."],
    };
  }
  const validation = await validateProtocolPackage(input.targetDir);
  return {
    status: validation.pass ? "completed" : "clarification_needed",
    summary: validation.pass
      ? "Package already conforms to the lightweight pi-protocol 0.2.0 checks."
      : `Package needs ${validation.issues.length} repair(s) for pi-protocol 0.2.0 compatibility.`,
    targetDir: validation.packageDir,
    diagnostics: validation.issues.map((issue) => `${issue.rule}: ${issue.message} — ${issue.suggestedFix}`),
    nextSteps: validation.pass
      ? ["Run npm run typecheck.", "Load/reload the Pi extension and inspect the protocol registry."]
      : ["Apply the listed fixes.", "Re-run pi_pi.build_package in repair mode.", "Run npm run typecheck."],
  };
}

async function adaptPackage(input: BuildPackageInput): Promise<BuildPackageOutput> {
  if (!input.targetDir) {
    return {
      status: "clarification_needed",
      summary: "Adapt mode needs targetDir for the existing Pi extension. I will inspect it, propose a protocol 0.2.0 surface, and only write changes when applyChanges is true.",
      nextSteps: ["Provide targetDir.", "Identify the capability that should become the public provide.", "Default to applyChanges: false for a reviewable plan."],
    };
  }
  const validation = await validateProtocolPackage(input.targetDir);
  return {
    status: validation.pass ? "completed" : "clarification_needed",
    summary: validation.pass
      ? "The existing package already looks like a modern protocol package."
      : "Adaptation plan: add/modernize package.json, pi.protocol.json, extension.ts, and protocol/handlers.ts using protocolVersion 0.2.0 and canonical execution.",
    targetDir: validation.packageDir,
    diagnostics: validation.issues.map((issue) => `${issue.rule}: ${issue.message}`),
    nextSteps: [
      "Choose the public provide names and schemas from the extension's real capabilities.",
      "Keep existing Pi UI code in extension.ts and route public calls through fabric.invoke where needed.",
      "Do not import sibling protocol packages directly.",
    ],
  };
}

async function newPackage(input: BuildPackageInput): Promise<BuildPackageOutput> {
  const spec = inferGeneratedPackageSpec(input.request);
  const generated = renderGeneratedPackage(spec);
  const files = Object.keys(generated.files).sort();

  if (!input.applyChanges) {
    return {
      status: "completed",
      summary: `Plan for ${spec.packageName}: generate a protocol 0.2.0 Pi package exposing ${spec.nodeId}.${spec.provideName}. Files: ${files.join(", ")}.`,
      targetDir: input.targetDir,
      nextSteps: [
        "Review the inferred package name, nodeId, provide name, and schemas.",
        "Invoke again with targetDir and applyChanges: true to write the starter package.",
        "Run npm install and npm run typecheck in the generated package.",
      ],
      diagnostics: ["No files written because applyChanges was false.", compactKnowledgeDigest()],
    };
  }

  if (!input.targetDir) {
    return {
      status: "clarification_needed",
      summary: "New package generation with applyChanges true requires targetDir.",
      nextSteps: ["Provide an empty or intended package directory as targetDir."],
    };
  }

  const targetDir = path.resolve(input.targetDir);
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
      ? `Generated ${spec.packageName} as a pi-protocol 0.2.0 package exposing ${spec.nodeId}.${spec.provideName}.`
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

function inferGeneratedPackageSpec(request: string): GeneratedPackageSpec {
  const lower = request.toLowerCase();
  const explicitPackage = lower.match(/(?:package|named|called)\s+([a-z][a-z0-9-]+)/)?.[1];
  const base = explicitPackage ?? inferBaseName(lower);
  const packageName = base.startsWith("pi-") ? base : `pi-${base}`;
  const nodeId = packageName.replace(/^pi-/, "pi_").replaceAll("-", "_");
  const provideName = inferProvideName(lower);
  return {
    packageName,
    nodeId,
    purpose: inferPurpose(request, provideName),
    provideName,
    provideDescription: inferProvideDescription(request, provideName),
    handlerName: provideName,
    slashCommandName: `${nodeId}.${provideName}`,
  };
}

function inferBaseName(lower: string): string {
  if (lower.includes("markdown") || lower.includes("md")) return "markdown-tools";
  if (lower.includes("review")) return "project-review";
  if (lower.includes("summar")) return "summarizer";
  return "protocol-package";
}

function inferProvideName(lower: string): string {
  const explicit = lower.match(/provide(?: named| called)?\s+([a-z][a-z0-9_]*)/)?.[1];
  if (explicit) return explicit;
  if (lower.includes("summar")) return "summarize";
  if (lower.includes("review")) return "review";
  if (lower.includes("repair") || lower.includes("validate")) return "validate_package";
  return "run";
}

function inferPurpose(request: string, provideName: string): string {
  return `Protocol package generated to ${provideName.replaceAll("_", " ")} requests: ${request.slice(0, 140)}`;
}

function inferProvideDescription(request: string, provideName: string): string {
  return `Handle ${provideName.replaceAll("_", " ")} requests for: ${request.slice(0, 120)}`;
}

function compactKnowledgeDigest(): string {
  return PROTOCOL_KNOWLEDGE.split("\n").filter((line) => line.trim().startsWith("-")).slice(0, 5).join(" ");
}
