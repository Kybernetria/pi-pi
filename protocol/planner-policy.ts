import { promises as fs } from "node:fs";
import path from "node:path";
import { INTERNAL_INSTRUCTIONS_DIR } from "./constants.ts";
import { collectSourceFiles, dedupe, exists, protocolError } from "./core-shared.ts";
import { ensureCertifiedPackageName } from "./builder-support.ts";
import { detectCapabilityKindsFromBrief } from "./provide-blueprints.ts";
import type {
  BrownfieldRepoCapabilityMapEntry,
  BrownfieldRepoMigrationStep,
  BrownfieldRepoPatchGuidanceEntry,
  BrownfieldRepoReuseRecommendation,
  ScaffoldProvideInput,
} from "./contracts.ts";

export interface ResolvedInternalInstruction {
  absolutePath: string;
  relativePath: string;
  content: string;
}

export interface PlanningPolicy {
  prefersSingleNodeByDefault: boolean;
  deterministicFirstOnlyWhenExplicitlyAbsent: boolean;
}

export async function resolveInternalInstruction(
  taskBaseName: string,
  aliases: string[] = [],
): Promise<ResolvedInternalInstruction> {
  const candidates = [`${taskBaseName}.md`, ...aliases];

  for (const candidate of candidates) {
    const absolutePath = path.join(INTERNAL_INSTRUCTIONS_DIR, candidate);
    if (await exists(absolutePath)) {
      return {
        absolutePath,
        relativePath: `protocol/instructions/${candidate}`,
        content: await fs.readFile(absolutePath, "utf8"),
      };
    }
  }

  throw protocolError(
    "EXECUTION_FAILED",
    `No internal instruction file found for ${taskBaseName}. Expected protocol/instructions/${taskBaseName}.md${aliases.length > 0 ? ` or one of: ${aliases.map((alias) => `protocol/instructions/${alias}`).join(", ")}` : ""}`,
  );
}

export function derivePlanningPolicy(instructionText: string): PlanningPolicy {
  const lowerInstruction = instructionText.toLowerCase();
  return {
    prefersSingleNodeByDefault:
      lowerInstruction.includes("default to:") || lowerInstruction.includes("one certified node"),
    deterministicFirstOnlyWhenExplicitlyAbsent:
      lowerInstruction.includes("deterministic first") || lowerInstruction.includes("prefer deterministic code first"),
  };
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function collectBrownfieldFiles(repoDir: string): Promise<string[]> {
  const sourceFiles = await collectSourceFiles(repoDir);
  const candidates = [
    "README.md",
    "CHANGELOG.md",
    "TODO.md",
    "package.json",
    "pi.protocol.json",
    "docs/guides/adapt-brownfield-to-pi-protocol-prompt.md",
  ];

  const present: string[] = [...sourceFiles.map((filePath) => path.relative(repoDir, filePath).replaceAll(path.sep, "/"))];
  for (const relativePath of candidates) {
    if (await exists(path.join(repoDir, relativePath))) present.push(relativePath);
  }
  return dedupe(present).sort();
}

export function collectCommandHints(sourceFiles: string[]): string[] {
  return dedupe(
    sourceFiles
      .filter((filePath) => filePath.startsWith("extensions/") || filePath.startsWith("scripts/"))
      .map((filePath) => path.basename(filePath, path.extname(filePath)))
      .filter((name) => name.length > 0),
  ).sort();
}

export function buildBrownfieldCapabilityMap(
  _repoDir: string,
  sourceFiles: string[],
  commands: string[],
  scripts: string[],
): BrownfieldRepoCapabilityMapEntry[] {
  const entries: BrownfieldRepoCapabilityMapEntry[] = [];

  if (sourceFiles.includes("extensions/index.ts")) {
    entries.push({ kind: "bootstrap", name: "extension-bootstrap", path: "extensions/index.ts", evidence: "session_start/session_shutdown wiring" });
  }
  if (sourceFiles.includes("protocol/handlers.ts")) {
    entries.push({ kind: "handler", name: "protocol-handlers", path: "protocol/handlers.ts", evidence: "exported protocol handlers" });
  }
  if (sourceFiles.includes("pi.protocol.json")) {
    entries.push({ kind: "manifest", name: "pi.protocol.json", path: "pi.protocol.json", evidence: "protocol manifest" });
  }

  for (const command of commands) {
    entries.push({ kind: "command", name: command, path: `scripts/${command}.ts`, evidence: "script/command entrypoint" });
  }
  for (const script of scripts) {
    entries.push({ kind: "script", name: script, path: "package.json", evidence: `npm script ${script}` });
  }

  if (sourceFiles.includes("README.md")) entries.push({ kind: "doc", name: "README", path: "README.md", evidence: "project overview and user-facing capabilities" });
  if (sourceFiles.includes("TODO.md")) entries.push({ kind: "doc", name: "TODO", path: "TODO.md", evidence: "planning checklist and gaps" });
  if (sourceFiles.includes("docs/guides/adapt-brownfield-to-pi-protocol-prompt.md")) {
    entries.push({ kind: "prompt", name: "brownfield-guide", path: "docs/guides/adapt-brownfield-to-pi-protocol-prompt.md", evidence: "migration guidance prompt" });
  }

  return entries;
}

export function buildBrownfieldProvideProposals(
  capabilityMap: BrownfieldRepoCapabilityMapEntry[],
  manifest: { provides?: Array<{ name?: string; handler?: string }> } | null,
): ScaffoldProvideInput[] {
  const provides: ScaffoldProvideInput[] = [];
  const manifestNames = new Set(manifest?.provides?.map((provide) => provide.name).filter((value): value is string => !!value));

  for (const entry of capabilityMap) {
    if (entry.kind !== "handler" && entry.kind !== "command" && entry.kind !== "script") continue;
    const name = entry.kind === "command" ? `project_${entry.name}` : entry.name.replace(/[^a-z0-9_]+/g, "_");
    if (!name || manifestNames.has(name)) continue;
    provides.push({ name, description: `Expose the existing ${entry.kind} capability from ${entry.path} as a protocol provide.` });
    if (provides.length >= 3) break;
  }

  if (provides.length === 0) {
    provides.push({ name: "migrate_repository", description: "Plan and guide a brownfield repository migration to Pi Protocol." });
  }
  return provides;
}

export function buildBrownfieldReuseRecommendations(
  capabilityMap: BrownfieldRepoCapabilityMapEntry[],
  manifest: { provides?: Array<{ name?: string; handler?: string }> } | null,
  recommendedShape: "single-node" | "collaborating-pair",
): BrownfieldRepoReuseRecommendation[] {
  const recommendations: BrownfieldRepoReuseRecommendation[] = [];
  const hasManifest = !!manifest;
  recommendations.push({ source: "existing README/TODO/docs", target: "capability map", rationale: "These files usually describe stable user-facing behavior already worth preserving.", confidence: "high" });
  recommendations.push({ source: "scripts and commands", target: "Pi command projections", rationale: "Existing operator entrypoints can become command projections without changing the underlying capability.", confidence: "medium" });
  recommendations.push({ source: "protocol/handlers.ts", target: recommendedShape === "collaborating-pair" ? "manager/worker provides" : "single-node provides", rationale: "Handlers are the closest source for protocol contracts and should be reused before inventing new ones.", confidence: hasManifest ? "high" : "medium" });
  if (!hasManifest) {
    recommendations.push({ source: "missing pi.protocol.json", target: "new manifest", rationale: "No manifest was found, so the first migration step is to describe the current surface in protocol form.", confidence: "high" });
  }
  return recommendations.slice(0, 4);
}

export function buildBrownfieldMigrationSteps(
  recommendedShape: "single-node" | "collaborating-pair",
  provides: ScaffoldProvideInput[],
  detectedEntrypoints: string[],
): BrownfieldRepoMigrationStep[] {
  return [
    { phase: 1, title: "Inventory current capabilities", goal: "Confirm the repo's user-facing commands, handlers, scripts, and docs.", recommendedFiles: detectedEntrypoints, notes: ["Keep this pass source-based and deterministic."] },
    { phase: 2, title: "Map capabilities to protocol provides", goal: "Turn existing behavior into a compact protocol contract before writing migration code.", recommendedFiles: ["pi.protocol.json", "protocol/handlers.ts"], notes: [recommendedShape === "collaborating-pair" ? "Split orchestration and worker responsibilities." : "Prefer one node unless the repo already has a clear split."] },
    { phase: 3, title: "Wire bootstrap and command projections", goal: "Preserve existing behavior while exposing Pi-native entrypoints.", recommendedFiles: ["extensions/index.ts", "scripts"], notes: ["Keep standard protocol projection behavior intact."] },
    { phase: 4, title: "Validate and tighten", goal: "Run validation/tests and only then consider deeper automation.", recommendedFiles: ["TODO.md", "CHANGELOG.md"], notes: [`Begin with ${provides.length} proposed public provide(s).`] },
  ];
}

export function buildBrownfieldPatchGuidance(
  recommendedShape: "single-node" | "collaborating-pair",
  detectedEntrypoints: string[],
  provides: ScaffoldProvideInput[],
  hasManifest: boolean,
): BrownfieldRepoPatchGuidanceEntry[] {
  return [
    {
      file: "pi.protocol.json",
      action: hasManifest ? "adapt" : "create",
      rationale: "Keep the protocol manifest compact and aligned to current public capabilities before deeper rewrites.",
      starterPatch: [
        "set nodeId and purpose from the repo's existing user-facing intent",
        `start with ${provides.slice(0, 3).map((provide) => provide.name).join(", ") || "one public provide"}`,
        "keep internal prompts and implementation details out of the public manifest",
      ],
    },
    {
      file: detectedEntrypoints.includes("protocol/handlers.ts") ? "protocol/handlers.ts" : "protocol/",
      action: detectedEntrypoints.includes("protocol/handlers.ts") ? "adapt" : "create",
      rationale: "Wrap or adapt existing deterministic code behind typed public handlers instead of rewriting behavior first.",
      starterPatch: [
        "preserve current business logic and move protocol shaping to handler boundaries",
        recommendedShape === "collaborating-pair"
          ? "separate orchestration handlers from worker handlers before adding cross-node delegation"
          : "keep one node until the repo clearly needs a manager/worker split",
      ],
    },
    {
      file: detectedEntrypoints.includes("extensions/index.ts") ? "extensions/index.ts" : "extensions/index.ts",
      action: detectedEntrypoints.includes("extensions/index.ts") ? "adapt" : "create",
      rationale: "Certified-node bootstrap should join the shared fabric, ensure the protocol projection, and register on session_start.",
      starterPatch: [
        "call ensureProtocolFabric(pi) during activation",
        "call ensureProtocolAgentProjection(pi, fabric) during session_start",
        "registerProtocolNode(...) on session_start and unregister on session_shutdown",
      ],
    },
    {
      file: "README.md",
      action: "review",
      rationale: "Keep operator-facing docs aligned with the public protocol surface and any retained command projections.",
      starterPatch: [
        "document which existing commands remain as projections",
        "document which provides are public versus internal",
      ],
    },
  ];
}

export function mentionsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

export function extractExplicitPackageNameFromBrief(brief: string): string | null {
  const patterns = [
    /\bpackage named\s+([a-z][a-z0-9-]*)\b/,
    /\bnode named\s+([a-z][a-z0-9-]*)\b/,
    /\bnamed\s+([a-z][a-z0-9-]*)\b/,
  ];

  for (const pattern of patterns) {
    const match = brief.match(pattern);
    if (match?.[1]) {
      return ensureCertifiedPackageName(match[1]);
    }
  }

  return null;
}

export function extractExplicitProvideNamesFromBrief(brief: string): string[] {
  if (!mentionsAny(brief, ["public provide", "public provides", "expose exactly", "expose two", "expose one"])) {
    return [];
  }

  const matches = brief.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [];
  return dedupe(matches.filter((name) => !name.startsWith("session_"))).slice(0, 6);
}

export function createExplicitProvideFromName(name: string, brief: string): ScaffoldProvideInput {
  if (name === "answer_loading_question") {
    return {
      name,
      description: "Answer typed questions about discovered Pi packages, current settings, missing package roots, and recommended next-session loading changes.",
    };
  }

  if (name === "configure_package_loading") {
    return {
      name,
      description: "Compute and optionally apply next-session package loading changes by editing project or global Pi settings.",
    };
  }

  if (name.startsWith("answer_")) {
    return {
      name,
      description: `Answer typed questions for the requested capability: ${normalizeWhitespace(brief).slice(0, 120)}.`,
    };
  }

  if (name.startsWith("configure_") || name.startsWith("update_") || name.startsWith("manage_")) {
    return {
      name,
      description: `Configure the requested capability through a typed protocol surface: ${normalizeWhitespace(brief).slice(0, 120)}.`,
    };
  }

  return {
    name,
    description: `Implement the explicit requested public provide ${name} for: ${normalizeWhitespace(brief).slice(0, 120)}.`,
  };
}

const COMMON_BRIEF_STOPWORDS = new Set([
  "build",
  "create",
  "make",
  "extension",
  "package",
  "certified",
  "protocol",
  "typed",
  "other",
  "through",
  "should",
  "would",
  "could",
  "local",
  "simple",
  "public",
  "provide",
  "command",
  "commands",
  "operator",
  "facing",
  "users",
  "user",
]);

export function detectCapabilityKinds(brief: string) {
  return detectCapabilityKindsFromBrief(brief);
}

export function inferBaseNameFromBrief(brief: string): string {
  const capabilityKinds = detectCapabilityKinds(brief);

  if (mentionsAny(brief, ["markdown", "notes"])) {
    return capabilityKinds.length > 1 ? "notes-workbench" : "notes-planner";
  }
  if (mentionsAny(brief, ["docs", "documents"])) {
    return capabilityKinds.length > 1 ? "docs-workbench" : "docs-assistant";
  }
  if (mentionsAny(brief, ["research"])) return "research";
  if (isValidationIntent(brief)) return "validator";
  if (mentionsAny(brief, ["search"])) return "search";

  const tokens = brief
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .filter((token) => !COMMON_BRIEF_STOPWORDS.has(token))
    .slice(0, 2);

  return tokens.length > 0 ? tokens.join("-") : "planned-node";
}

export function isValidationIntent(value: string): boolean {
  return (
    mentionsAny(value, ["validate", "validation", "verify", "lint", "compliance", "conformance"]) ||
    (mentionsAny(value, ["check", "checks", "checking"]) &&
      mentionsAny(value, ["package", "repo", "repository", "manifest", "schema", "types", "wiring", "bootstrap", "compliance"]))
  );
}

export function inferSingleNodePurpose(brief: string, baseName: string, provides: ScaffoldProvideInput[]): string {
  if (provides.some((provide) => provide.name === "configure_package_loading")) {
    return "Manages next-session Pi package loading configuration through a typed protocol package without claiming in-place changes to the current runtime.";
  }
  if (provides.some((provide) => provide.name === "answer_loading_question")) {
    return "Answers typed questions about discovered Pi packages and next-session loading configuration through a TypeScript-first certified protocol package.";
  }
  if (provides.some((provide) => provide.name === "ping")) {
    return "Provides a tiny ping/pong protocol surface for smoke tests and protocol-alignment checks.";
  }
  if (provides.some((provide) => provide.name === "summarize_url")) {
    return "Summarizes URL or webpage content through a TypeScript-first certified protocol package.";
  }
  if (provides.some((provide) => provide.name === "summarize_notes")) {
    return "Summarizes markdown notes through a TypeScript-first certified protocol package.";
  }
  if (provides.some((provide) => provide.name === "search_notes")) {
    return "Searches notes or docs through a TypeScript-first certified protocol package.";
  }
  if (provides.some((provide) => provide.name === "extract_tasks")) {
    return "Extracts actionable tasks into typed protocol output through a TypeScript-first certified package.";
  }
  if (provides.some((provide) => provide.name.startsWith("validate_"))) {
    return "Validates target inputs through a TypeScript-first certified protocol package.";
  }
  if (provides.some((provide) => provide.name.startsWith("answer_"))) {
    return "Answers domain-specific questions through a TypeScript-first certified protocol package.";
  }
  if (mentionsAny(brief, ["search"])) {
    return "Searches a target knowledge domain through a TypeScript-first certified protocol package.";
  }
  return `Implements ${baseName.replaceAll("-", " ")} through a TypeScript-first certified protocol package.`;
}

export function inferManagerProvideName(brief: string): string {
  if (mentionsAny(brief, ["research", "search", "findings", "investigate"])) return "delegate_research";
  if (mentionsAny(brief, ["summary", "summarize", "summarise"])) return "delegate_summary";
  if (isValidationIntent(brief)) return "delegate_validation";
  return "delegate_task";
}

export function inferWorkerProvideName(brief: string): string {
  if (mentionsAny(brief, ["research", "search", "findings", "investigate"])) return "perform_research";
  if (mentionsAny(brief, ["summary", "summarize", "summarise"])) return "perform_summary";
  if (isValidationIntent(brief)) return "perform_validation";
  return "do_task";
}
