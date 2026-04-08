import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type {
  JSONSchemaLite,
  ProtocolCallContext,
  ProtocolHandler,
  PiProtocolManifest,
} from "../vendor/pi-protocol-sdk.ts";

export const PROTOCOL_VERSION = "0.1.0";
export const SDK_DEPENDENCY = "^0.1.0";
export const PI_CODING_AGENT_VERSION = "^0.65.2";
export const NODE_TYPES_VERSION = "^24.5.2";
export const TYPESCRIPT_VERSION = "^5.9.3";
export const VALIDATION_MODE = "ast-assisted-source";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INTERNAL_INSTRUCTIONS_DIR = path.join(PACKAGE_ROOT, "protocol", "instructions");

export interface TemplateDescribeInput {
  includeCommandExamples?: boolean;
}

export interface GeneratedPackageDefaults {
  sdkDependency: string;
  useInlineSchemasDefault: boolean;
  generateDebugCommandsDefault: boolean;
  strictTypesDefault: boolean;
  validationMode: typeof VALIDATION_MODE;
}

export interface DescribeCertifiedTemplateOutput {
  templateKind: "pi-protocol-certified-node";
  language: "TypeScript";
  protocolVersion: string;
  requiredFiles: string[];
  recommendedFiles: string[];
  requiredDirectories: string[];
  requiredRuntimeBehaviors: string[];
  toolingProvides: string[];
  generatedPackageDefaults: GeneratedPackageDefaults;
  checklist: string[];
  commandExamples: string[];
  notes: string[];
}

export interface BuildCertifiedExtensionInput {
  description?: string;
  brief?: string;
  repoDir: string;
  replaceExisting?: boolean;
  applyChanges?: boolean;
  allowPair?: boolean;
}

export interface BuiltCertifiedPackageSummary {
  packageName: string;
  nodeId: string;
  packageDir: string;
  changedFiles: string[];
  provides: string[];
}

export interface BuildCertifiedExtensionOutput {
  status: "certified";
  repoDir: string;
  buildMode: "greenfield-single-node" | "greenfield-pair" | "brownfield-single-node";
  applied: boolean;
  packages: BuiltCertifiedPackageSummary[];
  changedFiles: string[];
  validation: {
    pass: true;
    validationMode: typeof VALIDATION_MODE;
    packageCount: number;
  };
  assumptions: string[];
  summary: string;
}

export interface PlanCertifiedNodeFromDescriptionInput {
  description: string;
  preferCollaboration?: boolean;
  includeInstructionDebug?: boolean;
}

export interface PlanCertifiedNodeFromDescriptionOutput {
  brief: string;
  recommendedShape: "single-node" | "collaborating-pair";
  suggestedPackageName: string;
  suggestedNodeId: string;
  suggestedPurpose: string;
  candidateProvides: ScaffoldProvideInput[];
  operatorCommandProjectionSuggested: boolean;
  agentBackedInternalsRecommended: boolean;
  recommendedWorkerMode: CollaboratingWorkerMode;
  assumptions: string[];
  clarificationNotes: string[];
  internalInstruction: {
    pathUsed: string;
    fallbackUsed: boolean;
  };
  singleNodeScaffoldInput?: ScaffoldCertifiedNodeInput;
  collaboratingNodesScaffoldInput?: ScaffoldCollaboratingNodesInput;
}

export interface BrownfieldRepoCapabilityMapEntry {
  kind: "command" | "tool" | "script" | "prompt" | "handler" | "bootstrap" | "manifest" | "schema" | "doc";
  name: string;
  path: string;
  evidence: string;
}

export interface BrownfieldRepoMigrationStep {
  phase: number;
  title: string;
  goal: string;
  recommendedFiles: string[];
  notes: string[];
}

export interface BrownfieldRepoReuseRecommendation {
  source: string;
  target: string;
  rationale: string;
  confidence: "high" | "medium" | "low";
}

export interface BrownfieldRepoPatchGuidanceEntry {
  file: string;
  action: "create" | "adapt" | "review";
  rationale: string;
  starterPatch: string[];
}

export interface PlanBrownfieldMigrationInput {
  repoDir: string;
  includeFileHints?: boolean;
  preferCollaboration?: boolean;
  includeInstructionDebug?: boolean;
}

export interface PlanBrownfieldMigrationOutput {
  repoDir: string;
  repoSummary: {
    packageName: string | null;
    scripts: string[];
    commands: string[];
    detectedEntrypoints: string[];
  };
  recommendedShape: "single-node" | "collaborating-pair";
  proposedPublicProvides: ScaffoldProvideInput[];
  proposedProjections: string[];
  capabilityMap: BrownfieldRepoCapabilityMapEntry[];
  reuseRecommendations: BrownfieldRepoReuseRecommendation[];
  migrationSteps: BrownfieldRepoMigrationStep[];
  patchGuidance: BrownfieldRepoPatchGuidanceEntry[];
  heuristicNotes: string[];
  manualFollowUps: string[];
  confidence: "high" | "medium" | "low";
  internalInstruction: {
    pathUsed: string;
    fallbackUsed: boolean;
  };
  sourceFiles: string[];
  fileHints?: Record<string, string[]>;
}

export interface ScaffoldProvideInput {
  name: string;
  description: string;
  version?: string;
  tags?: string[];
  effects?: string[];
}

export interface ScaffoldCertifiedNodeInput {
  packageName: string;
  nodeId: string;
  purpose: string;
  provides: ScaffoldProvideInput[];
  useInlineSchemas?: boolean;
  generateDebugCommands?: boolean;
  packageVersion?: string;
  sdkDependency?: string;
  strictTypes?: boolean;
}

export interface GeneratedFilePlanEntry {
  path: string;
  purpose: string;
}

export interface GeneratedProvideSummary {
  name: string;
  version?: string;
  handler: string;
  schemaMode: "inline" | "file";
}

export interface ScaffoldCertifiedNodeOutput {
  packageName: string;
  nodeId: string;
  sdkDependency: string;
  useInlineSchemas: boolean;
  generateDebugCommands: boolean;
  strictTypes: boolean;
  filePlan: GeneratedFilePlanEntry[];
  files: Record<string, string>;
  generatedProvides: GeneratedProvideSummary[];
  followUpValidationChecklist: string[];
  notes: string[];
}

export type CollaboratingWorkerMode = "deterministic" | "agent-backed";

export interface ScaffoldCollaboratingNodesInput {
  managerPackageName: string;
  managerNodeId: string;
  workerPackageName: string;
  workerNodeId: string;
  managerProvideName: string;
  workerProvideName: string;
  workerMode: CollaboratingWorkerMode;
  generateInternalPromptFiles?: boolean;
  generateDebugCommands?: boolean;
  packageVersion?: string;
  sdkDependency?: string;
  strictTypes?: boolean;
}

export interface CollaboratingPackageOutput {
  packageName: string;
  nodeId: string;
  filePlan: GeneratedFilePlanEntry[];
  files: Record<string, string>;
  generatedProvides: GeneratedProvideSummary[];
}

export interface ScaffoldCollaboratingNodesOutput {
  sdkDependency: string;
  strictTypes: boolean;
  generateDebugCommands: boolean;
  workerMode: CollaboratingWorkerMode;
  generateInternalPromptFiles: boolean;
  manager: CollaboratingPackageOutput;
  worker: CollaboratingPackageOutput;
  crossNodeWiringSummary: {
    managerNodeId: string;
    managerProvide: string;
    workerNodeId: string;
    workerProvide: string;
    invokePath: "ctx.delegate.invoke()";
    workerMode: CollaboratingWorkerMode;
  };
  localTestChecklist: string[];
  notes: string[];
}

export interface ValidationRuleResult {
  rule: string;
  message: string;
  suggestedFix: string;
}

export interface ValidateCertifiedNodeInput {
  packageDir: string;
}

export interface ValidatedProvideSummary {
  name: string;
  handler: string;
  visibility: string;
}

export interface ValidateCertifiedNodeOutput {
  packageDir: string;
  pass: boolean;
  validationMode: typeof VALIDATION_MODE;
  violatedRules: ValidationRuleResult[];
  suggestedFixes: string[];
  normalizedSummary: {
    packageName: string | null;
    nodeId: string | null;
    protocolVersion: string | null;
    provides: ValidatedProvideSummary[];
  };
  detectedRelevantFiles: string[];
}

interface SourceAstAnalysis {
  sourceFile: ts.SourceFile;
  parseErrors: string[];
  importSpecifiers: string[];
  exportedNames: Set<string>;
}

interface ExtensionBootstrapAnalysis {
  hasEnsureProtocolFabricCall: boolean;
  hasEnsureProtocolAgentProjectionCall: boolean;
  hasEnsureProtocolAgentProjectionOnSessionStart: boolean;
  hasRegisterProtocolNodeCall: boolean;
  hasSessionStartRegistration: boolean;
  hasSessionShutdownUnregister: boolean;
}

const CERTIFICATION_CHECKLIST = [
  "package.json#pi declares the package as a Pi package",
  "pi.protocol.json exists and matches the package handlers",
  "extensions/index.ts ensures the shared fabric and standard protocol projection during activation",
  "session_start registers the node with the shared fabric",
  "session_shutdown unregisters the node",
  "every public provide has input and output schemas",
  "cross-node calls use protocol-native delegation surfaces",
  "the package avoids forbidden direct sibling certified-node imports",
  "the package remains TypeScript-first and installable on its own",
];

const REQUIRED_FILES = [
  "package.json",
  "pi.protocol.json",
  "extensions/index.ts",
  "protocol/handlers.ts",
];

const RECOMMENDED_FILES = ["README.md", "tsconfig.json"];

export async function describeCertifiedTemplate(
  input: TemplateDescribeInput = {},
): Promise<DescribeCertifiedTemplateOutput> {
  return {
    templateKind: "pi-protocol-certified-node",
    language: "TypeScript",
    protocolVersion: PROTOCOL_VERSION,
    requiredFiles: REQUIRED_FILES,
    recommendedFiles: RECOMMENDED_FILES,
    requiredDirectories: ["extensions", "protocol", "protocol/schemas"],
    requiredRuntimeBehaviors: [
      "call ensureProtocolFabric(pi) during extension activation",
      "call ensureProtocolAgentProjection(pi, fabric) during session_start or equivalent runtime startup",
      "register with the shared fabric on session_start",
      "unregister from the shared fabric on session_shutdown",
      "prefer ctx.delegate.invoke() for recursive cross-node delegation",
      "use node-local handoff with opaque result boundaries by default when embedded subagent orchestration is needed",
      "ship pi.protocol.json as the canonical protocol contract",
    ],
    toolingProvides: [
      "describe_certified_template",
      "build_certified_extension",
      "validate_certified_extension",
    ],
    generatedPackageDefaults: {
      sdkDependency: `@kyvernitria/pi-protocol-sdk@${SDK_DEPENDENCY}`,
      useInlineSchemasDefault: false,
      generateDebugCommandsDefault: false,
      strictTypesDefault: true,
      validationMode: VALIDATION_MODE,
    },
    checklist: CERTIFICATION_CHECKLIST,
    commandExamples: input.includeCommandExamples
      ? [
          "/pi-pi-template",
          '/pi-pi-build-certified-extension {"description":"Build me a certified extension that summarizes markdown notes and also offers a local command.","repoDir":"./packages/pi-notes","applyChanges":true}',
          "/pi-pi-validate-certified-extension ./packages/pi-notes",
        ]
      : [],
    notes: [
      "build_certified_extension is the authoritative public builder surface and returns only a compact validated result.",
      "Low-level planning, migration, pair, scaffold, and alias stages stay internal to pi-pi.",
      "Certified package bootstrap should ensure both the shared fabric and the standard protocol projection.",
      "ctx.delegate is the preferred bound delegation surface for recursive cross-node calls because trace, caller, and budget context stay attached automatically.",
      "Node-local handoff is available natively in the runtime and keeps cross-node result boundaries opaque by default.",
      "Commands and tools are projections over the protocol, not the protocol itself.",
      `validate_certified_extension currently uses ${VALIDATION_MODE} checks rather than full semantic validation.`,
    ],
  };
}

export async function planCertifiedNodeFromDescription(
  input: PlanCertifiedNodeFromDescriptionInput,
): Promise<PlanCertifiedNodeFromDescriptionOutput> {
  validatePlanningInput(input);

  const brief = normalizeWhitespace(input.description);
  const instruction = await resolveInternalInstruction(
    "plan-extension-from-brief",
    ["plan-certified-node-from-description.md", "interpret-extension-brief.md"],
    { allowDefaultFallback: false },
  );
  const policy = derivePlanningPolicy(instruction.content);
  const lowerBrief = brief.toLowerCase();
  const operatorCommandProjectionSuggested = mentionsAny(lowerBrief, [
    "slash command",
    "command",
    "operator",
    "local use",
    "cli",
  ]);

  const candidateProvides = inferCandidateProvidesFromBrief(lowerBrief);
  const hasExplicitPairLanguage = mentionsAny(lowerBrief, [
    "collaborating pair",
    "manager/worker",
    "manager worker",
    "pair of nodes",
    "delegate",
    "delegates",
    "delegation",
    "planner/executor",
    "planner executor",
  ]);

  const agentBackedInternalsRecommended = mentionsAny(lowerBrief, [
    "agent-backed",
    "agent backed",
    "llm",
    "research",
    "reasoning",
    "synthesis",
    "synthesize",
    "creative",
  ]);

  const recommendedWorkerMode: CollaboratingWorkerMode =
    agentBackedInternalsRecommended && !policy.deterministicFirstOnlyWhenExplicitlyAbsent
      ? "agent-backed"
      : agentBackedInternalsRecommended
        ? "agent-backed"
        : "deterministic";

  const capabilityKinds = detectCapabilityKinds(lowerBrief);
  const pairRecommended =
    input.preferCollaboration === true ||
    hasExplicitPairLanguage ||
    (agentBackedInternalsRecommended &&
      capabilityKinds.includes("search") &&
      capabilityKinds.includes("summarize") &&
      mentionsAny(lowerBrief, ["gather", "collect", "research", "synthesize", "synthesise", "findings"]));

  const assumptions: string[] = [];
  const clarificationNotes: string[] = [];
  const baseName = inferBaseNameFromBrief(lowerBrief);

  if (policy.prefersSingleNodeByDefault && !pairRecommended) {
    assumptions.push("Defaulted to a single certified node because the brief did not strongly require cross-node delegation.");
  }

  if (!mentionsAny(lowerBrief, ["other nodes", "callable", "public provide", "protocol"])) {
    assumptions.push("Assumed the package should still expose at least one public provide so it remains capability-first.");
  }

  if (operatorCommandProjectionSuggested) {
    assumptions.push("Included an operator-facing command projection suggestion because the brief mentioned command/operator use.");
  }

  if (candidateProvides.length > 1) {
    assumptions.push("Inferred multiple candidate provides because the brief described more than one clear capability.");
  }

  if (agentBackedInternalsRecommended) {
    assumptions.push("Agent-backed internals were recommended because the brief suggests reasoning, research, or generative behavior.");
  } else if (policy.deterministicFirstOnlyWhenExplicitlyAbsent) {
    assumptions.push("Preferred deterministic internals first because the internal planning instruction says to default to deterministic designs when practical.");
  }

  if (pairRecommended) {
    const managerProvideName = inferManagerProvideName(lowerBrief);
    const workerProvideName = inferWorkerProvideName(lowerBrief);
    const collaboratingNodesScaffoldInput: ScaffoldCollaboratingNodesInput = {
      managerPackageName: `pi-${baseName}-manager`,
      managerNodeId: `pi-${baseName}-manager`,
      workerPackageName: `pi-${baseName}-worker`,
      workerNodeId: `pi-${baseName}-worker`,
      managerProvideName,
      workerProvideName,
      workerMode: recommendedWorkerMode,
      generateInternalPromptFiles: recommendedWorkerMode === "agent-backed",
      generateDebugCommands: operatorCommandProjectionSuggested,
      strictTypes: true,
    };

    if (!mentionsAny(lowerBrief, ["manager", "worker", "pair", "delegate"])) {
      clarificationNotes.push("A collaborating pair was chosen because preferCollaboration was requested, but the brief itself did not explicitly describe manager/worker boundaries.");
    }

    return {
      brief,
      recommendedShape: "collaborating-pair",
      suggestedPackageName: collaboratingNodesScaffoldInput.managerPackageName,
      suggestedNodeId: collaboratingNodesScaffoldInput.managerNodeId,
      suggestedPurpose: `Coordinate ${baseName.replaceAll("-", " ")} work through a manager/worker protocol pair.`,
      candidateProvides: [
        {
          name: managerProvideName,
          description: `Delegate structured ${baseName.replaceAll("-", " ")} work to a collaborating worker node.`,
        },
        {
          name: workerProvideName,
          description:
            recommendedWorkerMode === "agent-backed"
              ? `Perform ${baseName.replaceAll("-", " ")} work with agent-backed internal behavior while keeping the public provide typed.`
              : `Perform ${baseName.replaceAll("-", " ")} work deterministically and return typed output.`,
        },
      ],
      operatorCommandProjectionSuggested,
      agentBackedInternalsRecommended,
      recommendedWorkerMode,
      assumptions,
      clarificationNotes,
      internalInstruction: {
        pathUsed: instruction.relativePath,
        fallbackUsed: instruction.fallbackUsed,
      },
      collaboratingNodesScaffoldInput,
    };
  }

  const singleNodeScaffoldInput: ScaffoldCertifiedNodeInput = {
    packageName: `pi-${baseName}`,
    nodeId: `pi-${baseName}`,
    purpose: inferSingleNodePurpose(lowerBrief, baseName, candidateProvides),
    provides: candidateProvides,
    generateDebugCommands: operatorCommandProjectionSuggested,
    strictTypes: true,
  };

  if (mentionsAny(lowerBrief, ["pair", "delegate", "worker"])) {
    clarificationNotes.push("The brief hints at delegation, but this MVP planner still kept the recommendation single-node because the separation of responsibilities was not explicit enough.");
  }

  return {
    brief,
    recommendedShape: "single-node",
    suggestedPackageName: singleNodeScaffoldInput.packageName,
    suggestedNodeId: singleNodeScaffoldInput.nodeId,
    suggestedPurpose: singleNodeScaffoldInput.purpose,
    candidateProvides: singleNodeScaffoldInput.provides,
    operatorCommandProjectionSuggested,
    agentBackedInternalsRecommended,
    recommendedWorkerMode,
    assumptions,
    clarificationNotes,
    internalInstruction: {
      pathUsed: instruction.relativePath,
      fallbackUsed: instruction.fallbackUsed,
    },
    singleNodeScaffoldInput,
  };
}

export async function planBrownfieldMigration(
  input: PlanBrownfieldMigrationInput,
): Promise<PlanBrownfieldMigrationOutput> {
  validateBrownfieldPlanningInput(input);

  const repoDir = path.resolve(input.repoDir);
  const instruction = await resolveInternalInstruction(
    "plan-existing-repo-migration",
    ["plan-brownfield-migration.md", "adapt-brownfield-to-pi-protocol.md"],
    { allowDefaultFallback: false },
  );
  const fileHints: Record<string, string[]> = {};
  const sourceFiles = await collectBrownfieldFiles(repoDir);
  const packageJsonPath = path.join(repoDir, "package.json");
  const packageJson = (await readJsonIfExists(packageJsonPath)) as { name?: unknown; scripts?: Record<string, unknown> } | null;
  const manifestPath = path.join(repoDir, "pi.protocol.json");
  const manifest = (await readJsonIfExists(manifestPath)) as { provides?: Array<{ name?: string; handler?: string }>; nodeId?: unknown } | null;

  const commands = collectCommandHints(sourceFiles);
  const scripts = packageJson?.scripts ? Object.keys(packageJson.scripts).filter((key) => typeof key === "string") : [];
  const detectedEntrypoints = ((await Promise.all([
    exists(path.join(repoDir, "extensions", "index.ts")).then((value) => (value ? "extensions/index.ts" : null)),
    exists(path.join(repoDir, "protocol", "handlers.ts")).then((value) => (value ? "protocol/handlers.ts" : null)),
    exists(path.join(repoDir, "pi.protocol.json")).then((value) => (value ? "pi.protocol.json" : null)),
  ])) as Array<string | null>).filter((value): value is string => value !== null);

  const capabilityMap = buildBrownfieldCapabilityMap(repoDir, sourceFiles, commands, scripts);
  const proposedPublicProvides = buildBrownfieldProvideProposals(capabilityMap, manifest);
  const recommendedShape =
    input.preferCollaboration === true || capabilityMap.some((entry) => entry.kind === "handler" && /delegate|manager|worker/i.test(entry.name))
      ? "collaborating-pair"
      : "single-node";

  const proposedProjections = dedupe([
    ...(commands.length > 0 ? commands.map((command) => `/${command}`) : []),
    ...(scripts.length > 0 ? scripts.slice(0, 3).map((script) => `npm run ${script}`) : []),
  ]);

  const reuseRecommendations = buildBrownfieldReuseRecommendations(capabilityMap, manifest, recommendedShape);
  const migrationSteps = buildBrownfieldMigrationSteps(recommendedShape, proposedPublicProvides, detectedEntrypoints);
  const patchGuidance = buildBrownfieldPatchGuidance(recommendedShape, detectedEntrypoints, proposedPublicProvides, !!manifest);
  const heuristicNotes = [
    "Heuristic: this planner inspects repo files on disk and infers likely capabilities from names, scripts, handlers, and bootstrap wiring.",
    "Heuristic: existing commands and scripts are treated as projections candidates, not as the protocol contract itself.",
    recommendedShape === "collaborating-pair"
      ? "Heuristic: collaboration was suggested because the repo already exposes a split between orchestration and worker-like responsibilities."
      : "Heuristic: a single-node shape was suggested because the repo looks cohesive enough to preserve as one certified node for now.",
  ];
  const manualFollowUps = [
    "Confirm any inferred public provides against the repo's actual user-facing behavior.",
    "If the repository already has external integrations, decide which should stay internal before rewriting manifests.",
  ];

  if (input.includeFileHints) {
    fileHints["extensions/index.ts"] = ["Ensure the bootstrap registers the shared fabric and protocol projection on session_start."];
    fileHints["protocol/handlers.ts"] = ["Map existing handlers or utilities to public provides."];
    fileHints["pi.protocol.json"] = ["Keep the manifest focused on public protocol surface, not internal implementation details."];
  }

  return {
    repoDir,
    repoSummary: {
      packageName: typeof packageJson?.name === "string" ? packageJson.name : null,
      scripts,
      commands,
      detectedEntrypoints,
    },
    recommendedShape,
    proposedPublicProvides,
    proposedProjections,
    capabilityMap,
    reuseRecommendations,
    migrationSteps,
    patchGuidance,
    heuristicNotes,
    manualFollowUps,
    confidence: capabilityMap.length > 6 ? "medium" : "high",
    internalInstruction: {
      pathUsed: instruction.relativePath,
      fallbackUsed: instruction.fallbackUsed,
    },
    sourceFiles,
    fileHints: input.includeFileHints ? fileHints : undefined,
  };
}

interface ResolvedSdkDependency {
  packageName: string;
  versionSpec: string;
  display: string;
}

// Accept either a bare version/range (default package name), a package name, or a package@range
// spec so top-level chat can be a little sloppy without corrupting package.json output.
function resolveSdkDependency(spec: string | undefined): ResolvedSdkDependency {
  const defaultPackageName = "@kyvernitria/pi-protocol-sdk";
  const trimmed = spec?.trim();

  if (!trimmed) {
    return {
      packageName: defaultPackageName,
      versionSpec: SDK_DEPENDENCY,
      display: `${defaultPackageName}@${SDK_DEPENDENCY}`,
    };
  }

  const scopedMatch = trimmed.match(/^(@[^/]+\/[^@]+)(?:@(.+))?$/);
  if (scopedMatch) {
    const packageName = scopedMatch[1];
    const versionSpec = scopedMatch[2]?.trim() || SDK_DEPENDENCY;
    return {
      packageName,
      versionSpec,
      display: `${packageName}@${versionSpec}`,
    };
  }

  const unscopedMatch = trimmed.match(/^([^@][^@]*?)(?:@(.+))?$/);
  if (unscopedMatch && trimmed.includes("/")) {
    const packageName = unscopedMatch[1].trim();
    const versionSpec = unscopedMatch[2]?.trim() || SDK_DEPENDENCY;
    return {
      packageName,
      versionSpec,
      display: `${packageName}@${versionSpec}`,
    };
  }

  return {
    packageName: defaultPackageName,
    versionSpec: trimmed,
    display: `${defaultPackageName}@${trimmed}`,
  };
}

export async function scaffoldCertifiedNode(
  input: ScaffoldCertifiedNodeInput,
): Promise<ScaffoldCertifiedNodeOutput> {
  validateScaffoldInput(input);

  const packageVersion = input.packageVersion?.trim() || "0.1.0";
  const sdkDependency = resolveSdkDependency(input.sdkDependency);
  const useInlineSchemas = input.useInlineSchemas ?? false;
  const generateDebugCommands = input.generateDebugCommands ?? false;
  const strictTypes = input.strictTypes ?? true;
  const manifestProvides = input.provides.map((provide) => {
    const schemas = createStarterSchemas(provide);
    return {
      name: provide.name,
      description: provide.description,
      handler: provide.name,
      version: provide.version ?? "1.0.0",
      tags: provide.tags,
      effects: provide.effects,
      inputSchema: useInlineSchemas
        ? schemas.inputSchema
        : `./protocol/schemas/${provide.name}.input.json`,
      outputSchema: useInlineSchemas
        ? schemas.outputSchema
        : `./protocol/schemas/${provide.name}.output.json`,
    };
  });

  const manifest: PiProtocolManifest = {
    protocolVersion: PROTOCOL_VERSION,
    nodeId: input.nodeId,
    purpose: input.purpose,
    provides: manifestProvides,
  };

  const files: Record<string, string> = {
    "package.json": renderJson({
      name: input.packageName,
      version: packageVersion,
      type: "module",
      keywords: ["pi-package", "pi-protocol"],
      dependencies: {
        [sdkDependency.packageName]: sdkDependency.versionSpec,
      },
      peerDependencies: {
        "@mariozechner/pi-coding-agent": "*",
      },
      devDependencies: {
        "@mariozechner/pi-coding-agent": PI_CODING_AGENT_VERSION,
        "@types/node": NODE_TYPES_VERSION,
        "typescript": TYPESCRIPT_VERSION,
      },
      pi: {
        extensions: ["./extensions"],
      },
    }),
    "pi.protocol.json": renderJson(manifest),
    "tsconfig.json": renderJson({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        resolveJsonModule: true,
        allowImportingTsExtensions: true,
        verbatimModuleSyntax: true,
        types: ["node"],
        strict: strictTypes,
        skipLibCheck: true,
      },
      include: ["extensions/**/*.ts", "protocol/**/*.ts"],
    }),
    "extensions/index.ts": renderExtensionFile({
      packageName: input.packageName,
      packageVersion,
      nodeId: input.nodeId,
      generateDebugCommands,
    }),
    "protocol/handlers.ts": renderHandlersFile(input.nodeId, input.provides),
    "README.md": renderReadme(input, useInlineSchemas, generateDebugCommands, sdkDependency.display, strictTypes),
  };

  if (!useInlineSchemas) {
    for (const provide of input.provides) {
      const schemas = createStarterSchemas(provide);
      files[`protocol/schemas/${provide.name}.input.json`] = renderJson(schemas.inputSchema);
      files[`protocol/schemas/${provide.name}.output.json`] = renderJson(schemas.outputSchema);
    }
  }

  return {
    packageName: input.packageName,
    nodeId: input.nodeId,
    sdkDependency: sdkDependency.display,
    useInlineSchemas,
    generateDebugCommands,
    strictTypes,
    filePlan: Object.keys(files)
      .sort()
      .map((filePath) => ({
        path: filePath,
        purpose: describeGeneratedFile(filePath),
      })),
    files,
    generatedProvides: manifestProvides.map((provide) => ({
      name: provide.name,
      version: provide.version,
      handler: provide.handler,
      schemaMode: useInlineSchemas ? "inline" : "file",
    })),
    followUpValidationChecklist: CERTIFICATION_CHECKLIST,
    notes: [
      "This provide returns generated files without writing them to disk.",
      "Use a Pi command projection such as /pi-pi-scaffold-extension if you want operator-driven file writing.",
      "Generated bootstrap ensures the shared fabric and the standard protocol projection by default.",
      `The generated package stamps ${sdkDependency.display}. Override sdkDependency for local development if needed.`,
    ],
  };
}

export async function scaffoldCollaboratingNodes(
  input: ScaffoldCollaboratingNodesInput,
): Promise<ScaffoldCollaboratingNodesOutput> {
  validateCollaboratingNodesInput(input);

  const packageVersion = input.packageVersion?.trim() || "0.1.0";
  const sdkDependency = resolveSdkDependency(input.sdkDependency);
  const strictTypes = input.strictTypes ?? true;
  const generateDebugCommands = input.generateDebugCommands ?? false;
  const generateInternalPromptFiles = input.generateInternalPromptFiles ?? input.workerMode === "agent-backed";

  const managerSchemas = createManagerProvideSchemas(input.workerNodeId, input.workerProvideName, input.workerMode);
  const workerSchemas = createWorkerProvideSchemas(input.workerMode, generateInternalPromptFiles);

  const managerManifest: PiProtocolManifest = {
    protocolVersion: PROTOCOL_VERSION,
    nodeId: input.managerNodeId,
    purpose: `Coordinates work and delegates ${input.workerProvideName} to ${input.workerNodeId} through the protocol-native delegation surface.`,
    provides: [
      {
        name: input.managerProvideName,
        description: `Delegate structured work to ${input.workerNodeId}.${input.workerProvideName} through ctx.delegate.invoke().`,
        handler: input.managerProvideName,
        version: "1.0.0",
        tags: ["manager", "delegation", "protocol"],
        effects: undefined,
        inputSchema: `./protocol/schemas/${input.managerProvideName}.input.json`,
        outputSchema: `./protocol/schemas/${input.managerProvideName}.output.json`,
      },
    ],
  };

  const workerManifest: PiProtocolManifest = {
    protocolVersion: PROTOCOL_VERSION,
    nodeId: input.workerNodeId,
    purpose:
      input.workerMode === "deterministic"
        ? `Executes ${input.workerProvideName} deterministically for collaborating protocol nodes.`
        : `Executes ${input.workerProvideName} with an agent-backed-ready internal pattern while preserving a typed protocol surface.`,
    provides: [
      {
        name: input.workerProvideName,
        description:
          input.workerMode === "deterministic"
            ? "Perform a deterministic worker task and return structured output."
            : "Perform a worker task using an internal agent-backed-ready pattern and return structured output.",
        handler: input.workerProvideName,
        version: "1.0.0",
        tags: ["worker", input.workerMode, "protocol"],
        effects:
          input.workerMode === "deterministic"
            ? undefined
            : generateInternalPromptFiles
              ? ["llm_call", "file_read"]
              : ["llm_call"],
        inputSchema: `./protocol/schemas/${input.workerProvideName}.input.json`,
        outputSchema: `./protocol/schemas/${input.workerProvideName}.output.json`,
      },
    ],
  };

  const managerFiles = createCollaboratingPackageFiles({
    packageName: input.managerPackageName,
    nodeId: input.managerNodeId,
    packageVersion,
    sdkDependency,
    strictTypes,
    generateDebugCommands,
    manifest: managerManifest,
    handlersFile: renderManagerHandlersFile(input),
    readme: renderCollaboratingReadme({
      packageName: input.managerPackageName,
      nodeId: input.managerNodeId,
      purpose: managerManifest.purpose,
      sdkDependency: sdkDependency.display,
      strictTypes,
      generateDebugCommands,
      collaborationRole: "manager",
      workerMode: input.workerMode,
      notes: [
        `This node delegates ${input.managerProvideName} to ${input.workerNodeId}.${input.workerProvideName} through ctx.delegate.invoke().`,
        "It never imports the worker node directly.",
      ],
    }),
    schemas: {
      [`protocol/schemas/${input.managerProvideName}.input.json`]: managerSchemas.inputSchema,
      [`protocol/schemas/${input.managerProvideName}.output.json`]: managerSchemas.outputSchema,
    },
  });

  const workerExtraFiles: Record<string, string> = {};
  if (input.workerMode === "agent-backed" && generateInternalPromptFiles) {
    workerExtraFiles[`protocol/prompts/${input.workerProvideName}.md`] = renderWorkerInternalPrompt(input);
  }

  const workerFiles = createCollaboratingPackageFiles({
    packageName: input.workerPackageName,
    nodeId: input.workerNodeId,
    packageVersion,
    sdkDependency,
    strictTypes,
    generateDebugCommands,
    manifest: workerManifest,
    handlersFile: renderWorkerHandlersFile(input, generateInternalPromptFiles),
    readme: renderCollaboratingReadme({
      packageName: input.workerPackageName,
      nodeId: input.workerNodeId,
      purpose: workerManifest.purpose,
      sdkDependency: sdkDependency.display,
      strictTypes,
      generateDebugCommands,
      collaborationRole: "worker",
      workerMode: input.workerMode,
      notes: [
        input.workerMode === "deterministic"
          ? "This worker returns a schema-valid deterministic response."
          : "This worker demonstrates an agent-backed-ready internal pattern while keeping the external provide typed.",
        generateInternalPromptFiles
          ? `Internal prompt file generated at protocol/prompts/${input.workerProvideName}.md and intentionally not exposed as a public skill.`
          : "No internal prompt file was generated.",
      ],
    }),
    schemas: {
      [`protocol/schemas/${input.workerProvideName}.input.json`]: workerSchemas.inputSchema,
      [`protocol/schemas/${input.workerProvideName}.output.json`]: workerSchemas.outputSchema,
    },
    extraFiles: workerExtraFiles,
  });

  return {
    sdkDependency: sdkDependency.display,
    strictTypes,
    generateDebugCommands,
    workerMode: input.workerMode,
    generateInternalPromptFiles,
    manager: {
      packageName: input.managerPackageName,
      nodeId: input.managerNodeId,
      filePlan: Object.keys(managerFiles)
        .sort()
        .map((filePath) => ({ path: filePath, purpose: describeGeneratedFile(filePath) })),
      files: managerFiles,
      generatedProvides: [
        {
          name: input.managerProvideName,
          version: "1.0.0",
          handler: input.managerProvideName,
          schemaMode: "file",
        },
      ],
    },
    worker: {
      packageName: input.workerPackageName,
      nodeId: input.workerNodeId,
      filePlan: Object.keys(workerFiles)
        .sort()
        .map((filePath) => ({ path: filePath, purpose: describeGeneratedFile(filePath) })),
      files: workerFiles,
      generatedProvides: [
        {
          name: input.workerProvideName,
          version: "1.0.0",
          handler: input.workerProvideName,
          schemaMode: "file",
        },
      ],
    },
    crossNodeWiringSummary: {
      managerNodeId: input.managerNodeId,
      managerProvide: input.managerProvideName,
      workerNodeId: input.workerNodeId,
      workerProvide: input.workerProvideName,
      invokePath: "ctx.delegate.invoke()",
      workerMode: input.workerMode,
    },
    localTestChecklist: [
      `Install both ${input.managerPackageName} and ${input.workerPackageName} into the same Pi process.`,
      "Start Pi and confirm both nodes register into the shared fabric.",
      `Invoke ${input.managerNodeId}.${input.managerProvideName} and confirm it calls ${input.workerNodeId}.${input.workerProvideName} through ctx.delegate.invoke().`,
      "Verify there are no direct sibling imports between the generated packages.",
      generateInternalPromptFiles
        ? `Confirm protocol/prompts/${input.workerProvideName}.md exists only inside the worker package and is not exposed as a public skill.`
        : "No internal prompt files should exist in the worker package.",
    ],
    notes: [
      "Both generated packages are independently installable Pi packages.",
      "The manager invokes the worker through a typed provide rather than agent-to-agent chat.",
      "Generated bootstrap ensures the standard protocol projection alongside the shared fabric.",
      "The worker may implement its provide deterministically or with an internal agent-backed-ready pattern while keeping the same protocol contract.",
    ],
  };
}

async function resolveSchemaObject(
  packageDir: string,
  schema: string | JSONSchemaLite | undefined,
): Promise<JSONSchemaLite | null> {
  if (!schema) return null;
  if (typeof schema === "object") return schema;

  const schemaPath = path.resolve(packageDir, schema);
  if (!(await exists(schemaPath))) return null;

  try {
    return JSON.parse(await fs.readFile(schemaPath, "utf8")) as JSONSchemaLite;
  } catch {
    return null;
  }
}

function schemaRequiresProperty(schema: JSONSchemaLite | null, propertyName: string): boolean {
  return Array.isArray(schema?.required) && schema.required.includes(propertyName);
}

function schemaHasProperty(schema: JSONSchemaLite | null, propertyName: string): boolean {
  return !!schema?.properties && propertyName in schema.properties;
}

function schemaLooksLikePingContract(
  inputSchema: JSONSchemaLite | null,
  outputSchema: JSONSchemaLite | null,
): boolean {
  return (
    !schemaRequiresProperty(inputSchema, "targetPath") &&
    !schemaHasProperty(outputSchema, "pass") &&
    !schemaHasProperty(outputSchema, "findings") &&
    schemaHasProperty(outputSchema, "response")
  );
}

export async function validateCertifiedNode(
  input: ValidateCertifiedNodeInput,
): Promise<ValidateCertifiedNodeOutput> {
  if (!input || typeof input !== "object" || !input.packageDir?.trim()) {
    throw protocolError("INVALID_INPUT", "validate_extension requires a non-empty packageDir");
  }

  const packageDir = path.resolve(input.packageDir);
  const violations: ValidationRuleResult[] = [];
  const detectedRelevantFiles: string[] = [];

  const packageJsonPath = path.join(packageDir, "package.json");
  const manifestPath = path.join(packageDir, "pi.protocol.json");
  const extensionTsPath = path.join(packageDir, "extensions", "index.ts");
  const extensionJsPath = path.join(packageDir, "extensions", "index.js");
  const handlersTsPath = path.join(packageDir, "protocol", "handlers.ts");
  const handlersJsPath = path.join(packageDir, "protocol", "handlers.js");

  const packageJsonExists = await exists(packageJsonPath);
  const manifestExists = await exists(manifestPath);
  const extensionPath = (await exists(extensionTsPath)) ? extensionTsPath : extensionJsPath;
  const handlersPath = (await exists(handlersTsPath)) ? handlersTsPath : handlersJsPath;

  for (const requiredFile of REQUIRED_FILES) {
    const resolved = path.join(packageDir, requiredFile);
    if (await exists(resolved)) {
      detectedRelevantFiles.push(requiredFile);
    }
  }

  if (!packageJsonExists) {
    violations.push({
      rule: "required-file.package-json",
      message: "Missing package.json",
      suggestedFix: "Add a package.json file with native Pi metadata under package.json#pi.",
    });
  }

  if (!manifestExists) {
    violations.push({
      rule: "required-file.pi-protocol-json",
      message: "Missing pi.protocol.json",
      suggestedFix: "Add a root pi.protocol.json sidecar manifest.",
    });
  }

  if (!(await exists(extensionPath))) {
    violations.push({
      rule: "required-file.extension",
      message: "Missing extensions/index.ts or extensions/index.js",
      suggestedFix: "Add the standard bootstrap extension entrypoint under extensions/index.ts.",
    });
  }

  if (!(await exists(handlersPath))) {
    violations.push({
      rule: "required-file.handlers",
      message: "Missing protocol/handlers.ts or protocol/handlers.js",
      suggestedFix: "Add local protocol handlers under protocol/handlers.ts.",
    });
  }

  let packageJson: any = null;
  if (packageJsonExists) {
    try {
      packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    } catch {
      violations.push({
        rule: "package-json.parse",
        message: "package.json is not valid JSON",
        suggestedFix: "Fix package.json so it parses as valid JSON.",
      });
    }
  }

  let manifest: PiProtocolManifest | null = null;
  if (manifestExists) {
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    } catch {
      violations.push({
        rule: "manifest.parse",
        message: "pi.protocol.json is not valid JSON",
        suggestedFix: "Fix pi.protocol.json so it parses as valid JSON.",
      });
    }
  }

  if (packageJson) {
    if (!packageJson.pi || !Array.isArray(packageJson.pi.extensions) || packageJson.pi.extensions.length === 0) {
      violations.push({
        rule: "package-json.pi",
        message: "package.json#pi.extensions is missing or empty",
        suggestedFix: "Declare the extension directory in package.json#pi.extensions.",
      });
    }

    for (const violation of findLocalDependencyViolations(packageJson)) {
      violations.push(violation);
    }
  }

  let exportedHandlerNames = new Set<string>();
  let handlersSource = "";
  let handlerAstAnalysis: SourceAstAnalysis | null = null;
  if (await exists(handlersPath)) {
    handlersSource = await fs.readFile(handlersPath, "utf8");
    handlerAstAnalysis = analyzeSourceAst(handlersPath, handlersSource);
    if (handlerAstAnalysis.parseErrors.length > 0) {
      violations.push({
        rule: "handlers.parse",
        message: `protocol handlers source contains parse errors: ${handlerAstAnalysis.parseErrors[0]}`,
        suggestedFix: "Fix protocol/handlers.ts so it parses as valid TypeScript or JavaScript.",
      });
    }
    exportedHandlerNames = handlerAstAnalysis.exportedNames;
  }

  let extensionSource = "";
  let extensionAstAnalysis: SourceAstAnalysis | null = null;
  if (await exists(extensionPath)) {
    extensionSource = await fs.readFile(extensionPath, "utf8");
    extensionAstAnalysis = analyzeSourceAst(extensionPath, extensionSource);
    if (extensionAstAnalysis.parseErrors.length > 0) {
      violations.push({
        rule: "extension.parse",
        message: `extension source contains parse errors: ${extensionAstAnalysis.parseErrors[0]}`,
        suggestedFix: "Fix extensions/index.ts so it parses as valid TypeScript or JavaScript.",
      });
    }
  }

  if (manifest) {
    if (manifest.protocolVersion !== PROTOCOL_VERSION) {
      violations.push({
        rule: "manifest.protocol-version",
        message: `Unsupported protocolVersion ${String(manifest.protocolVersion)}`,
        suggestedFix: `Set protocolVersion to ${PROTOCOL_VERSION}.`,
      });
    }

    if (!manifest.nodeId || typeof manifest.nodeId !== "string") {
      violations.push({
        rule: "manifest.node-id",
        message: "Manifest nodeId is missing or empty",
        suggestedFix: "Provide a stable non-empty nodeId in pi.protocol.json.",
      });
    }

    if (!manifest.purpose || typeof manifest.purpose !== "string") {
      violations.push({
        rule: "manifest.purpose",
        message: "Manifest purpose is missing or empty",
        suggestedFix: "Provide a concise non-empty purpose in pi.protocol.json.",
      });
    }

    const seenProvides = new Set<string>();
    for (const provide of manifest.provides ?? []) {
      if (!provide.name) {
        violations.push({
          rule: "provide.name",
          message: "A provide is missing its name",
          suggestedFix: "Give every provide a non-empty local name.",
        });
        continue;
      }

      if (seenProvides.has(provide.name)) {
        violations.push({
          rule: "provide.duplicate",
          message: `Duplicate provide name ${provide.name}`,
          suggestedFix: "Use unique local provide names within one node.",
        });
      }
      seenProvides.add(provide.name);

      if (!provide.description) {
        violations.push({
          rule: `provide.description.${provide.name}`,
          message: `Provide ${provide.name} is missing a description`,
          suggestedFix: "Add a human-readable description for each provide.",
        });
      }

      if (!provide.handler) {
        violations.push({
          rule: `provide.handler.${provide.name}`,
          message: `Provide ${provide.name} is missing a handler reference`,
          suggestedFix: "Set the handler field to a local exported handler name.",
        });
      } else if (!exportedHandlerNames.has(provide.handler)) {
        violations.push({
          rule: `provide.handler-missing.${provide.name}`,
          message: `Handler ${provide.handler} was not found in protocol/handlers`,
          suggestedFix: `Export ${provide.handler} from protocol/handlers.ts or update the manifest handler reference.`,
        });
      }

      for (const [schemaLabel, schemaValue] of [
        ["inputSchema", provide.inputSchema],
        ["outputSchema", provide.outputSchema],
      ] as const) {
        if (!schemaValue) {
          violations.push({
            rule: `${provide.name}.${schemaLabel}`,
            message: `Provide ${provide.name} is missing ${schemaLabel}`,
            suggestedFix: `Add ${schemaLabel} for ${provide.name}.`,
          });
          continue;
        }

        if (typeof schemaValue === "string") {
          const schemaPath = path.resolve(packageDir, schemaValue);
          if (!(await exists(schemaPath))) {
            violations.push({
              rule: `${provide.name}.${schemaLabel}.path`,
              message: `${schemaLabel} path ${schemaValue} does not exist`,
              suggestedFix: `Create ${schemaValue} or replace it with an inline schema object.`,
            });
          }
        } else if (typeof schemaValue !== "object") {
          violations.push({
            rule: `${provide.name}.${schemaLabel}.shape`,
            message: `${schemaLabel} for ${provide.name} must be a schema object or relative path string`,
            suggestedFix: `Use a JSON schema object or a relative schema file path for ${schemaLabel}.`,
          });
        }
      }

      const inputSchemaObject = await resolveSchemaObject(packageDir, provide.inputSchema);
      const outputSchemaObject = await resolveSchemaObject(packageDir, provide.outputSchema);

      // Tiny semantic guardrail: a package may be structurally valid yet still obviously wrong,
      // e.g. a provide named "ping" with validation-style targetPath/pass/findings fields.
      if (provide.name === "ping" && !schemaLooksLikePingContract(inputSchemaObject, outputSchemaObject)) {
        violations.push({
          rule: "provide.semantic.ping",
          message: "Provide ping does not look like a ping/pong contract",
          suggestedFix: "Use a lightweight ping schema, e.g. optional note input and output containing response: \"pong\" instead of validation-style fields such as targetPath, pass, or findings.",
        });
      }
    }
  }

  if (extensionAstAnalysis) {
    const bootstrapAnalysis = analyzeExtensionBootstrap(extensionAstAnalysis.sourceFile);

    if (!bootstrapAnalysis.hasEnsureProtocolFabricCall) {
      violations.push({
        rule: "bootstrap.ensure-fabric",
        message: "Extension bootstrap does not call ensureProtocolFabric",
        suggestedFix: "Call ensureProtocolFabric(pi) during activation.",
      });
    }

    if (!bootstrapAnalysis.hasEnsureProtocolAgentProjectionCall) {
      violations.push({
        rule: "bootstrap.ensure-protocol-projection",
        message: "Extension bootstrap does not call ensureProtocolAgentProjection",
        suggestedFix: "Call ensureProtocolAgentProjection(pi, fabric) during session_start or equivalent runtime startup.",
      });
    }

    if (!bootstrapAnalysis.hasEnsureProtocolAgentProjectionOnSessionStart) {
      violations.push({
        rule: "bootstrap.ensure-protocol-projection.session-start",
        message: "Extension bootstrap does not ensure the protocol projection inside session_start",
        suggestedFix: "Call ensureProtocolAgentProjection(pi, fabric) inside a session_start handler so the protocol tool is available on runtime startup.",
      });
    }

    if (!bootstrapAnalysis.hasRegisterProtocolNodeCall) {
      violations.push({
        rule: "bootstrap.register-node",
        message: "Extension bootstrap does not call registerProtocolNode",
        suggestedFix: "Register the node during session_start using registerProtocolNode(...).",
      });
    }

    if (!bootstrapAnalysis.hasSessionStartRegistration) {
      violations.push({
        rule: "bootstrap.session-start",
        message: "Extension bootstrap does not register on session_start",
        suggestedFix: "Move registration into a session_start handler.",
      });
    }

    if (!bootstrapAnalysis.hasSessionShutdownUnregister) {
      violations.push({
        rule: "bootstrap.session-shutdown",
        message: "Extension bootstrap does not unregister on session_shutdown",
        suggestedFix: "Unregister the node in a session_shutdown handler.",
      });
    }
  }

  const sourceFiles = await collectSourceFiles(packageDir);
  for (const filePath of sourceFiles) {
    const source = await fs.readFile(filePath, "utf8");
    const sourceAstAnalysis = analyzeSourceAst(filePath, source);

    if (sourceAstAnalysis.parseErrors.length > 0) {
      violations.push({
        rule: `source.parse.${path.relative(packageDir, filePath).replaceAll(path.sep, ".")}`,
        message: `Source file ${path.relative(packageDir, filePath)} contains parse errors: ${sourceAstAnalysis.parseErrors[0]}`,
        suggestedFix: "Fix the source file so it parses as valid TypeScript or JavaScript.",
      });
    }

    for (const specifier of sourceAstAnalysis.importSpecifiers) {
      if (isForbiddenCertifiedNodeImport(specifier, getPackageName(packageJson))) {
        violations.push({
          rule: "imports.forbidden-certified-node",
          message: `Forbidden certified-node import detected in ${path.relative(packageDir, filePath)}: ${specifier}`,
          suggestedFix: "Remove direct sibling node imports and use protocol-native delegation surfaces such as ctx.delegate.invoke() for cross-node calls.",
        });
      }
    }
  }

  const provides = manifest?.provides?.map((provide) => ({
    name: provide.name,
    handler: provide.handler,
    visibility: provide.visibility ?? "public",
  })) ?? [];

  return {
    packageDir,
    pass: violations.length === 0,
    violatedRules: violations,
    suggestedFixes: violations.map((violation) => violation.suggestedFix),
    normalizedSummary: {
      packageName: packageJson?.name ?? null,
      nodeId: manifest?.nodeId ?? null,
      protocolVersion: manifest?.protocolVersion ?? null,
      provides,
    },
    validationMode: VALIDATION_MODE,
    detectedRelevantFiles: dedupe([
      ...detectedRelevantFiles,
      ...sourceFiles.map((filePath) => path.relative(packageDir, filePath)),
    ]).sort(),
  };
}

type InternalBuilderProvide =
  | "plan_extension_from_brief"
  | "plan_existing_repo_migration"
  | "scaffold_extension"
  | "scaffold_extension_pair"
  | "validate_extension";

interface InternalBuilderRuntime {
  invokeInternal<TOutput>(provide: InternalBuilderProvide, input: unknown): Promise<TOutput>;
}

interface BuildArtifact {
  packageName: string;
  nodeId: string;
  relativeDir: string;
  files: Record<string, string>;
  provides: string[];
  changedFiles: string[];
}

async function buildCertifiedExtensionWithRuntime(
  input: BuildCertifiedExtensionInput,
  runtime: InternalBuilderRuntime,
): Promise<BuildCertifiedExtensionOutput> {
  validateBuildCertifiedExtensionInput(input);

  const description = normalizeBuildCertifiedExtensionDescription(input);
  const repoDir = path.resolve(input.repoDir);
  const applyChanges = input.applyChanges ?? true;
  const allowPair = input.allowPair ?? false;
  const repoState = await classifyCertifiedBuildRepo(repoDir);
  const assumptions: string[] = [];

  if (repoState.kind === "brownfield" && input.replaceExisting !== true) {
    throw protocolError(
      "INVALID_INPUT",
      "build_certified_extension found existing repository content. Re-run with replaceExisting:true so pi-pi can replace it with a certified build instead of improvising a partial non-certified migration.",
    );
  }

  let buildMode: BuildCertifiedExtensionOutput["buildMode"];
  let artifacts: BuildArtifact[] = [];

  const plan = await runtime.invokeInternal<PlanCertifiedNodeFromDescriptionOutput>(
    "plan_extension_from_brief",
    {
      description,
      preferCollaboration: allowPair,
    },
  );

  assumptions.push(...plan.assumptions, ...plan.clarificationNotes);

  if (repoState.kind === "greenfield") {
    if (plan.recommendedShape === "collaborating-pair") {
      if (!allowPair) {
        throw protocolError(
          "INVALID_INPUT",
          "build_certified_extension determined that this brief requires a collaborating pair. Re-run with allowPair:true or simplify the brief to a single certified extension.",
        );
      }

      if (!plan.collaboratingNodesScaffoldInput) {
        throw protocolError("EXECUTION_FAILED", "planner did not return collaboratingNodesScaffoldInput");
      }

      const pair = await runtime.invokeInternal<ScaffoldCollaboratingNodesOutput>(
        "scaffold_extension_pair",
        plan.collaboratingNodesScaffoldInput,
      );
      artifacts = toPairBuildArtifacts(pair);
      buildMode = "greenfield-pair";
    } else {
      const scaffoldInput =
        plan.singleNodeScaffoldInput ?? {
          packageName: plan.suggestedPackageName,
          nodeId: plan.suggestedNodeId,
          purpose: plan.suggestedPurpose,
          provides: plan.candidateProvides,
          strictTypes: true,
        };
      const scaffold = await runtime.invokeInternal<ScaffoldCertifiedNodeOutput>(
        "scaffold_extension",
        scaffoldInput,
      );
      artifacts = [toSingleNodeBuildArtifact(scaffold)];
      buildMode = "greenfield-single-node";
    }
  } else {
    const migrationPlan = await runtime.invokeInternal<PlanBrownfieldMigrationOutput>(
      "plan_existing_repo_migration",
      {
        repoDir,
        includeFileHints: false,
        preferCollaboration: false,
      },
    );

    assumptions.push(
      ...migrationPlan.heuristicNotes.slice(0, 2),
      ...migrationPlan.manualFollowUps.slice(0, 1),
      "Brownfield replacement keeps the user brief as the authoritative target contract; repo inspection is advisory only.",
    );

    if (plan.recommendedShape === "collaborating-pair" || migrationPlan.recommendedShape === "collaborating-pair") {
      throw protocolError(
        "INVALID_INPUT",
        "build_certified_extension currently exposes brownfield replacement only as a single certified package. Use a fresh repo for pair mode or split the migration into separate certified packages.",
      );
    }

    const scaffold = await runtime.invokeInternal<ScaffoldCertifiedNodeOutput>("scaffold_extension", {
      packageName: ensureCertifiedPackageName(migrationPlan.repoSummary.packageName ?? path.basename(repoDir)),
      nodeId: ensureCertifiedNodeId(migrationPlan.repoSummary.packageName ?? path.basename(repoDir)),
      purpose: plan.suggestedPurpose,
      provides: plan.candidateProvides,
      generateDebugCommands: plan.operatorCommandProjectionSuggested,
      strictTypes: true,
    } satisfies ScaffoldCertifiedNodeInput);

    artifacts = [toSingleNodeBuildArtifact(scaffold)];
    buildMode = "brownfield-single-node";
  }

  const changedFiles = dedupe(artifacts.flatMap((artifact) => artifact.changedFiles)).sort();
  const packages = await stageAndValidateBuildArtifacts(repoDir, artifacts, runtime);

  if (applyChanges) {
    if (repoState.kind === "brownfield" && input.replaceExisting === true) {
      await clearDirectoryPreservingGit(repoDir);
    }

    for (const artifact of artifacts) {
      const packageDir = artifact.relativeDir === "." ? repoDir : path.join(repoDir, artifact.relativeDir);
      await writeGeneratedFiles(packageDir, artifact.files);
    }

    for (const builtPackage of packages) {
      const finalValidation = await runtime.invokeInternal<ValidateCertifiedNodeOutput>(
        "validate_extension",
        { packageDir: builtPackage.packageDir },
      );
      if (!finalValidation.pass) {
        throw protocolError(
          "EXECUTION_FAILED",
          `Applied files for ${builtPackage.packageName}, but final validation still failed: ${finalValidation.violatedRules[0]?.message ?? "unknown validation error"}`,
        );
      }
    }
  }

  return {
    status: "certified",
    repoDir,
    buildMode,
    applied: applyChanges,
    packages,
    changedFiles,
    validation: {
      pass: true,
      validationMode: VALIDATION_MODE,
      packageCount: packages.length,
    },
    assumptions: dedupe(assumptions).slice(0, 8),
    summary: applyChanges
      ? `Built ${packages.length} protocol-certified package${packages.length === 1 ? "" : "s"} and validated ${changedFiles.length} file change${changedFiles.length === 1 ? "" : "s"}.`
      : `Dry-run complete: validated ${packages.length} protocol-certified package${packages.length === 1 ? "" : "s"} in staging without writing local files.`,
  };
}

function createDirectInternalBuilderRuntime(): InternalBuilderRuntime {
  return {
    async invokeInternal<TOutput>(provide: InternalBuilderProvide, input: unknown): Promise<TOutput> {
      switch (provide) {
        case "plan_extension_from_brief":
          return (await planCertifiedNodeFromDescription(
            input as PlanCertifiedNodeFromDescriptionInput,
          )) as TOutput;
        case "plan_existing_repo_migration":
          return (await planBrownfieldMigration(input as PlanBrownfieldMigrationInput)) as TOutput;
        case "scaffold_extension":
          return (await scaffoldCertifiedNode(input as ScaffoldCertifiedNodeInput)) as TOutput;
        case "scaffold_extension_pair":
          return (await scaffoldCollaboratingNodes(input as ScaffoldCollaboratingNodesInput)) as TOutput;
        case "validate_extension":
          return (await validateCertifiedNode(input as ValidateCertifiedNodeInput)) as TOutput;
      }
    },
  };
}

function createDelegateBackedInternalBuilderRuntime(
  ctx: Pick<ProtocolCallContext, "delegate" | "calleeNodeId">,
): InternalBuilderRuntime {
  return {
    async invokeInternal<TOutput>(provide: InternalBuilderProvide, input: unknown): Promise<TOutput> {
      const result = await ctx.delegate.invoke<unknown, TOutput>({
        provide,
        target: { nodeId: ctx.calleeNodeId },
        routing: "deterministic",
        input,
      });

      if (!result.ok) {
        throw protocolError(
          result.error.code,
          `internal builder stage ${provide} failed: ${result.error.message}`,
        );
      }

      return result.output as TOutput;
    },
  };
}

function normalizeBuildCertifiedExtensionDescription(input: BuildCertifiedExtensionInput): string {
  const value = input.description?.trim() || input.brief?.trim();
  return normalizeWhitespace(value ?? "");
}

function validateBuildCertifiedExtensionInput(input: BuildCertifiedExtensionInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "build_certified_extension requires an input object");
  }

  if (!normalizeBuildCertifiedExtensionDescription(input)) {
    throw protocolError("INVALID_INPUT", "description or brief is required");
  }

  if (!input.repoDir?.trim()) {
    throw protocolError("INVALID_INPUT", "repoDir is required");
  }

  if (input.replaceExisting !== undefined && typeof input.replaceExisting !== "boolean") {
    throw protocolError("INVALID_INPUT", "replaceExisting must be boolean when provided");
  }

  if (input.applyChanges !== undefined && typeof input.applyChanges !== "boolean") {
    throw protocolError("INVALID_INPUT", "applyChanges must be boolean when provided");
  }

  if (input.allowPair !== undefined && typeof input.allowPair !== "boolean") {
    throw protocolError("INVALID_INPUT", "allowPair must be boolean when provided");
  }
}

async function classifyCertifiedBuildRepo(
  repoDir: string,
): Promise<{ kind: "greenfield" | "brownfield"; entries: string[] }> {
  if (!(await exists(repoDir))) {
    return { kind: "greenfield", entries: [] };
  }

  const harmlessRootEntries = new Set([
    ".gitignore",
    ".npmignore",
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "README",
    "README.md",
    "CHANGELOG.md",
  ]);

  const entries = await fs.readdir(repoDir, { withFileTypes: true }).catch(() => []);
  const visibleEntries = entries.filter((entry) => entry.name !== ".git");
  const brownfieldSignals = visibleEntries.filter((entry) => {
    if (entry.isDirectory()) {
      return ![".github"].includes(entry.name);
    }

    return !harmlessRootEntries.has(entry.name);
  });

  return {
    kind: brownfieldSignals.length > 0 ? "brownfield" : "greenfield",
    entries: visibleEntries.map((entry) => entry.name),
  };
}

function sanitizeCertifiedName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const safe = normalized || "certified-extension";
  return /^[a-z]/.test(safe) ? safe : `pi-${safe}`;
}

function ensureCertifiedPackageName(value: string): string {
  const safe = sanitizeCertifiedName(value);
  return safe.startsWith("pi-") ? safe : `pi-${safe}`;
}

function ensureCertifiedNodeId(value: string): string {
  return ensureCertifiedPackageName(value);
}

function toSingleNodeBuildArtifact(scaffold: ScaffoldCertifiedNodeOutput): BuildArtifact {
  return {
    packageName: scaffold.packageName,
    nodeId: scaffold.nodeId,
    relativeDir: ".",
    files: scaffold.files,
    provides: scaffold.generatedProvides.map((provide) => provide.name),
    changedFiles: Object.keys(scaffold.files).sort(),
  };
}

function toPairBuildArtifacts(scaffold: ScaffoldCollaboratingNodesOutput): BuildArtifact[] {
  return [
    {
      packageName: scaffold.manager.packageName,
      nodeId: scaffold.manager.nodeId,
      relativeDir: scaffold.manager.packageName,
      files: scaffold.manager.files,
      provides: scaffold.manager.generatedProvides.map((provide) => provide.name),
      changedFiles: Object.keys(scaffold.manager.files)
        .sort()
        .map((filePath) => path.posix.join(scaffold.manager.packageName, filePath)),
    },
    {
      packageName: scaffold.worker.packageName,
      nodeId: scaffold.worker.nodeId,
      relativeDir: scaffold.worker.packageName,
      files: scaffold.worker.files,
      provides: scaffold.worker.generatedProvides.map((provide) => provide.name),
      changedFiles: Object.keys(scaffold.worker.files)
        .sort()
        .map((filePath) => path.posix.join(scaffold.worker.packageName, filePath)),
    },
  ];
}

async function writeGeneratedFiles(rootDir: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }
}

async function stageAndValidateBuildArtifacts(
  repoDir: string,
  artifacts: BuildArtifact[],
  runtime: InternalBuilderRuntime,
): Promise<BuiltCertifiedPackageSummary[]> {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-certified-build-"));

  try {
    const results: BuiltCertifiedPackageSummary[] = [];

    for (const artifact of artifacts) {
      const stagedPackageDir = artifact.relativeDir === "." ? stagingRoot : path.join(stagingRoot, artifact.relativeDir);
      await writeGeneratedFiles(stagedPackageDir, artifact.files);

      const validation = await runtime.invokeInternal<ValidateCertifiedNodeOutput>("validate_extension", {
        packageDir: stagedPackageDir,
      });

      if (!validation.pass) {
        throw protocolError(
          "EXECUTION_FAILED",
          `pi-pi generated ${artifact.packageName}, but certification failed: ${validation.violatedRules[0]?.message ?? "unknown validation error"}`,
        );
      }

      results.push({
        packageName: artifact.packageName,
        nodeId: artifact.nodeId,
        packageDir: artifact.relativeDir === "." ? repoDir : path.join(repoDir, artifact.relativeDir),
        changedFiles: artifact.changedFiles,
        provides: artifact.provides,
      });
    }

    return results;
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function clearDirectoryPreservingGit(rootDir: string): Promise<void> {
  await fs.mkdir(rootDir, { recursive: true });
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".git") continue;
    await fs.rm(path.join(rootDir, entry.name), { recursive: true, force: true });
  }
}

export async function buildCertifiedExtension(
  input: BuildCertifiedExtensionInput,
): Promise<BuildCertifiedExtensionOutput> {
  return buildCertifiedExtensionWithRuntime(input, createDirectInternalBuilderRuntime());
}

export async function validateCertifiedExtension(
  input: ValidateCertifiedNodeInput,
): Promise<ValidateCertifiedNodeOutput> {
  return validateCertifiedNode(input);
}

export const describe_certified_template: ProtocolHandler = async (_ctx, input) =>
  describeCertifiedTemplate((input ?? {}) as TemplateDescribeInput);

export const build_certified_extension: ProtocolHandler = async (ctx, input) =>
  ctx.handoff.run(
    async (handoffCtx) =>
      buildCertifiedExtensionWithRuntime(
        input as BuildCertifiedExtensionInput,
        createDelegateBackedInternalBuilderRuntime(handoffCtx),
      ),
    {
      brief: "pi-pi authoritative certified builder orchestration",
      opaque: true,
    },
  );

export const validate_certified_extension: ProtocolHandler = async (_ctx, input) =>
  validateCertifiedExtension(input as ValidateCertifiedNodeInput);

export const plan_extension_from_brief: ProtocolHandler = async (_ctx, input) =>
  planCertifiedNodeFromDescription(input as PlanCertifiedNodeFromDescriptionInput);

export const plan_existing_repo_migration: ProtocolHandler = async (_ctx, input) =>
  planBrownfieldMigration(input as PlanBrownfieldMigrationInput);

export const scaffold_extension: ProtocolHandler = async (_ctx, input) =>
  scaffoldCertifiedNode(input as ScaffoldCertifiedNodeInput);

export const scaffold_extension_pair: ProtocolHandler = async (_ctx, input) =>
  scaffoldCollaboratingNodes(input as ScaffoldCollaboratingNodesInput);

export const validate_extension: ProtocolHandler = async (_ctx, input) =>
  validateCertifiedNode(input as ValidateCertifiedNodeInput);

export const plan_certified_node_from_description: ProtocolHandler = plan_extension_from_brief;
export const plan_brownfield_migration: ProtocolHandler = plan_existing_repo_migration;
export const scaffold_certified_node: ProtocolHandler = scaffold_extension;
export const scaffold_collaborating_nodes: ProtocolHandler = scaffold_extension_pair;
export const validate_certified_node: ProtocolHandler = validate_extension;

export const planExtensionFromBrief = planCertifiedNodeFromDescription;
export const planExistingRepoMigration = planBrownfieldMigration;
export const scaffoldExtension = scaffoldCertifiedNode;
export const scaffoldExtensionPair = scaffoldCollaboratingNodes;
export const validateExtension = validateCertifiedExtension;

function validatePlanningInput(input: PlanCertifiedNodeFromDescriptionInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "plan_extension_from_brief requires an input object");
  }

  if (!input.description?.trim()) {
    throw protocolError("INVALID_INPUT", "description is required");
  }

  if (input.preferCollaboration !== undefined && typeof input.preferCollaboration !== "boolean") {
    throw protocolError("INVALID_INPUT", "preferCollaboration must be boolean when provided");
  }

  if (input.includeInstructionDebug !== undefined && typeof input.includeInstructionDebug !== "boolean") {
    throw protocolError("INVALID_INPUT", "includeInstructionDebug must be boolean when provided");
  }
}

function validateBrownfieldPlanningInput(input: PlanBrownfieldMigrationInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "plan_existing_repo_migration requires an input object");
  }

  if (!input.repoDir?.trim()) {
    throw protocolError("INVALID_INPUT", "repoDir is required");
  }

  if (input.includeFileHints !== undefined && typeof input.includeFileHints !== "boolean") {
    throw protocolError("INVALID_INPUT", "includeFileHints must be boolean when provided");
  }

  if (input.preferCollaboration !== undefined && typeof input.preferCollaboration !== "boolean") {
    throw protocolError("INVALID_INPUT", "preferCollaboration must be boolean when provided");
  }

  if (input.includeInstructionDebug !== undefined && typeof input.includeInstructionDebug !== "boolean") {
    throw protocolError("INVALID_INPUT", "includeInstructionDebug must be boolean when provided");
  }
}

function validateScaffoldInput(input: ScaffoldCertifiedNodeInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "scaffold_extension requires an input object");
  }

  if (!input.packageName?.trim()) {
    throw protocolError("INVALID_INPUT", "packageName is required");
  }

  if (!input.nodeId?.trim()) {
    throw protocolError("INVALID_INPUT", "nodeId is required");
  }

  if (!/^[a-z][a-z0-9-]*$/.test(input.packageName)) {
    throw protocolError(
      "INVALID_INPUT",
      "packageName must match /^[a-z][a-z0-9-]*$/ for the starter template",
    );
  }

  if (!/^[a-z][a-z0-9-]*$/.test(input.nodeId)) {
    throw protocolError(
      "INVALID_INPUT",
      "nodeId must match /^[a-z][a-z0-9-]*$/ for the starter template",
    );
  }

  if (!input.purpose?.trim()) {
    throw protocolError("INVALID_INPUT", "purpose is required");
  }

  if (input.sdkDependency !== undefined && !input.sdkDependency.trim()) {
    throw protocolError("INVALID_INPUT", "sdkDependency must be a non-empty string when provided");
  }

  if (input.strictTypes !== undefined && typeof input.strictTypes !== "boolean") {
    throw protocolError("INVALID_INPUT", "strictTypes must be boolean when provided");
  }

  if (!Array.isArray(input.provides) || input.provides.length === 0) {
    throw protocolError("INVALID_INPUT", "provides must be a non-empty array");
  }

  const seen = new Set<string>();
  for (const provide of input.provides) {
    if (!provide?.name || !provide?.description) {
      throw protocolError("INVALID_INPUT", "each provide requires name and description");
    }

    if (!/^[a-z][a-z0-9_]*$/.test(provide.name)) {
      throw protocolError(
        "INVALID_INPUT",
        `provide name ${provide.name} must match /^[a-z][a-z0-9_]*$/ so it is a valid handler export`,
      );
    }

    if (seen.has(provide.name)) {
      throw protocolError("INVALID_INPUT", `duplicate provide name ${provide.name}`);
    }
    seen.add(provide.name);
  }
}

function validateCollaboratingNodesInput(input: ScaffoldCollaboratingNodesInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "scaffold_extension_pair requires an input object");
  }

  const packageFields = [
    ["managerPackageName", input.managerPackageName],
    ["managerNodeId", input.managerNodeId],
    ["workerPackageName", input.workerPackageName],
    ["workerNodeId", input.workerNodeId],
  ] as const;

  for (const [label, value] of packageFields) {
    if (!value?.trim()) {
      throw protocolError("INVALID_INPUT", `${label} is required`);
    }

    if (!/^[a-z][a-z0-9-]*$/.test(value)) {
      throw protocolError("INVALID_INPUT", `${label} must match /^[a-z][a-z0-9-]*$/`);
    }
  }

  const provideFields = [
    ["managerProvideName", input.managerProvideName],
    ["workerProvideName", input.workerProvideName],
  ] as const;

  for (const [label, value] of provideFields) {
    if (!value?.trim()) {
      throw protocolError("INVALID_INPUT", `${label} is required`);
    }

    if (!/^[a-z][a-z0-9_]*$/.test(value)) {
      throw protocolError("INVALID_INPUT", `${label} must match /^[a-z][a-z0-9_]*$/`);
    }
  }

  if (input.workerMode !== "deterministic" && input.workerMode !== "agent-backed") {
    throw protocolError("INVALID_INPUT", "workerMode must be 'deterministic' or 'agent-backed'");
  }

  if (input.sdkDependency !== undefined && !input.sdkDependency.trim()) {
    throw protocolError("INVALID_INPUT", "sdkDependency must be a non-empty string when provided");
  }

  if (input.strictTypes !== undefined && typeof input.strictTypes !== "boolean") {
    throw protocolError("INVALID_INPUT", "strictTypes must be boolean when provided");
  }

  if (
    input.generateInternalPromptFiles !== undefined &&
    typeof input.generateInternalPromptFiles !== "boolean"
  ) {
    throw protocolError("INVALID_INPUT", "generateInternalPromptFiles must be boolean when provided");
  }
}

interface ResolvedInternalInstruction {
  absolutePath: string;
  relativePath: string;
  content: string;
  fallbackUsed: boolean;
}

interface InternalInstructionResolutionOptions {
  allowDefaultFallback?: boolean;
}

interface PlanningPolicy {
  prefersSingleNodeByDefault: boolean;
  deterministicFirstOnlyWhenExplicitlyAbsent: boolean;
}

async function resolveInternalInstruction(
  taskBaseName: string,
  aliases: string[] = [],
  options: InternalInstructionResolutionOptions = {},
): Promise<ResolvedInternalInstruction> {
  const candidates = options.allowDefaultFallback === false ? [`${taskBaseName}.md`, ...aliases] : [`${taskBaseName}.md`, ...aliases, "default.md"];

  for (const candidate of candidates) {
    const absolutePath = path.join(INTERNAL_INSTRUCTIONS_DIR, candidate);
    if (await exists(absolutePath)) {
      return {
        absolutePath,
        relativePath: `protocol/instructions/${candidate}`,
        content: await fs.readFile(absolutePath, "utf8"),
        fallbackUsed: candidate === "default.md",
      };
    }
  }

  throw protocolError(
    "EXECUTION_FAILED",
    `No internal instruction file found for ${taskBaseName}. Expected protocol/instructions/${taskBaseName}.md${aliases.length > 0 ? ` or one of: ${aliases.map((alias) => `protocol/instructions/${alias}`).join(", ")}` : ""}${options.allowDefaultFallback === false ? "" : " or protocol/instructions/default.md"}`,
  );
}

function derivePlanningPolicy(instructionText: string): PlanningPolicy {
  const lowerInstruction = instructionText.toLowerCase();
  return {
    prefersSingleNodeByDefault:
      lowerInstruction.includes("default to:") || lowerInstruction.includes("one certified node"),
    deterministicFirstOnlyWhenExplicitlyAbsent:
      lowerInstruction.includes("deterministic first") || lowerInstruction.includes("prefer deterministic code first"),
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function collectBrownfieldFiles(repoDir: string): Promise<string[]> {
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

function collectCommandHints(sourceFiles: string[]): string[] {
  return dedupe(
    sourceFiles
      .filter((filePath) => filePath.startsWith("extensions/") || filePath.startsWith("scripts/"))
      .map((filePath) => path.basename(filePath, path.extname(filePath)))
      .filter((name) => name.length > 0),
  ).sort();
}

function buildBrownfieldCapabilityMap(
  repoDir: string,
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

function buildBrownfieldProvideProposals(
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

function buildBrownfieldReuseRecommendations(
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

function buildBrownfieldMigrationSteps(
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

function buildBrownfieldPatchGuidance(
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

function mentionsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

type InferredProvideKind =
  | "ping"
  | "summarize"
  | "search"
  | "validate"
  | "extract_tasks"
  | "answer"
  | "classify"
  | "generic";

interface InferredProvideBlueprint {
  kind: InferredProvideKind;
  inputSchema: JSONSchemaLite;
  outputSchema: JSONSchemaLite;
}

// These heuristics stay intentionally small and deterministic so the planner remains
// protocol-first while still producing more realistic starter surfaces from normal chat.
function inferBaseNameFromBrief(brief: string): string {
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

// Keep validation detection narrower than plain English "checks" so tiny ping/smoke-test
// packages do not accidentally get validation-shaped schemas and handlers.
function isValidationIntent(value: string): boolean {
  return (
    mentionsAny(value, ["validate", "validation", "verify", "lint", "compliance", "conformance"]) ||
    (mentionsAny(value, ["check", "checks", "checking"]) &&
      mentionsAny(value, ["package", "repo", "repository", "manifest", "schema", "types", "wiring", "bootstrap", "compliance"]))
  );
}

function detectCapabilityKinds(brief: string): InferredProvideKind[] {
  const detected = new Set<InferredProvideKind>();

  if (mentionsAny(brief, ["ping", "pong", "heartbeat", "healthcheck", "health check", "smoke test"])) {
    detected.add("ping");
  }
  if (mentionsAny(brief, ["summary", "summarize", "summarise"])) detected.add("summarize");
  if (mentionsAny(brief, ["search", "find", "lookup", "grep", "research", "investigate"])) detected.add("search");
  if (isValidationIntent(brief)) detected.add("validate");
  if (mentionsAny(brief, ["todo", "todos", "task list", "tasks", "action items", "extract task"])) {
    detected.add("extract_tasks");
  }
  if (mentionsAny(brief, ["question", "questions", "answer", "q&a", "qa"])) detected.add("answer");
  if (mentionsAny(brief, ["classify", "classification", "categorize", "categorise", "tagging", "tag text"])) {
    detected.add("classify");
  }

  return detected.size > 0 ? [...detected] : ["generic"];
}

function inferCandidateProvidesFromBrief(brief: string): ScaffoldProvideInput[] {
  const kinds = detectCapabilityKinds(brief);
  const results: ScaffoldProvideInput[] = [];
  const seen = new Set<string>();

  const pushProvide = (provide: ScaffoldProvideInput) => {
    if (seen.has(provide.name)) return;
    seen.add(provide.name);
    results.push(provide);
  };

  for (const kind of kinds) {
    switch (kind) {
      case "ping":
        pushProvide({
          name: "ping",
          description: "Return a simple pong response for protocol alignment or smoke-test checks.",
        });
        break;
      case "summarize":
        pushProvide({
          name: mentionsAny(brief, ["markdown", "notes", "docs", "documents"]) ? "summarize_notes" : "summarize_content",
          description: mentionsAny(brief, ["markdown", "notes", "docs", "documents"])
            ? "Summarize markdown notes or similar workspace text into a typed protocol response."
            : "Summarize supplied content into a typed protocol response.",
        });
        break;
      case "search":
        pushProvide({
          name: mentionsAny(brief, ["markdown", "notes", "docs", "documents"]) ? "search_notes" : "search_content",
          description: mentionsAny(brief, ["markdown", "notes", "docs", "documents"])
            ? "Search workspace notes or docs and return typed matches."
            : "Search supplied content sources and return typed matches.",
        });
        break;
      case "validate":
        pushProvide({
          name: mentionsAny(brief, ["repo", "repository"]) ? "validate_repo" : "validate_package",
          description: mentionsAny(brief, ["repo", "repository"])
            ? "Validate a repository request and return typed findings."
            : "Validate a target package or repo request and return a typed assessment.",
        });
        break;
      case "extract_tasks":
        pushProvide({
          name: "extract_tasks",
          description: "Extract actionable tasks or TODO items into a typed protocol response.",
        });
        break;
      case "answer":
        pushProvide({
          name: mentionsAny(brief, ["markdown", "notes", "docs", "documents"]) ? "answer_questions" : "answer_question",
          description: mentionsAny(brief, ["markdown", "notes", "docs", "documents"])
            ? "Answer questions against notes or docs and return typed citations."
            : "Answer a supplied question and return a typed response.",
        });
        break;
      case "classify":
        pushProvide({
          name: "classify_text",
          description: "Classify supplied text into typed categories.",
        });
        break;
      case "generic":
        pushProvide({
          name: "handle_request",
          description: `Handle the described capability from the brief: ${normalizeWhitespace(brief).slice(0, 120)}.`,
        });
        break;
    }
  }

  return results.slice(0, 3);
}

function inferSingleNodePurpose(brief: string, baseName: string, provides: ScaffoldProvideInput[]): string {
  if (provides.some((provide) => provide.name === "ping")) {
    return "Provides a tiny ping/pong protocol surface for smoke tests and protocol-alignment checks.";
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

function inferManagerProvideName(brief: string): string {
  if (mentionsAny(brief, ["research", "search", "findings", "investigate"])) return "delegate_research";
  if (mentionsAny(brief, ["summary", "summarize", "summarise"])) return "delegate_summary";
  if (isValidationIntent(brief)) return "delegate_validation";
  return "delegate_task";
}

function inferWorkerProvideName(brief: string): string {
  if (mentionsAny(brief, ["research", "search", "findings", "investigate"])) return "perform_research";
  if (mentionsAny(brief, ["summary", "summarize", "summarise"])) return "perform_summary";
  if (isValidationIntent(brief)) return "perform_validation";
  return "do_task";
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

function inferProvideKind(provide: ScaffoldProvideInput): InferredProvideKind {
  const signature = `${provide.name} ${provide.description}`.toLowerCase();
  if (provide.name === "ping" || mentionsAny(signature, [" ping", "ping ", "pong", "heartbeat", "healthcheck", "health check"])) return "ping";
  if (mentionsAny(signature, ["summary", "summarize", "summarise"])) return "summarize";
  if (mentionsAny(signature, ["search", "find", "lookup", "grep", "research"])) return "search";
  if (isValidationIntent(signature)) return "validate";
  if (mentionsAny(signature, ["task", "todo", "action items"])) return "extract_tasks";
  if (mentionsAny(signature, ["answer", "question", "q&a", "qa"])) return "answer";
  if (mentionsAny(signature, ["classify", "classification", "categorize", "categorise", "tag"])) return "classify";
  return "generic";
}

function inferProvideBlueprint(provide: ScaffoldProvideInput): InferredProvideBlueprint {
  switch (inferProvideKind(provide)) {
    case "ping":
      return {
        kind: "ping",
        inputSchema: {
          type: "object",
          properties: {
            note: { type: "string", description: "Optional caller note to echo back with the pong response." },
          },
        },
        outputSchema: {
          type: "object",
          required: ["status", "provide", "nodeId", "response"],
          properties: {
            status: { type: "string", enum: ["ok"], description: "Ping completed successfully." },
            provide: { type: "string", description: "The provide that produced the response." },
            nodeId: { type: "string", description: "The current callee nodeId." },
            response: { type: "string", enum: ["pong"], description: "Canonical ping response." },
            echoedNote: { type: "string", description: "Optional caller note echoed back by the starter handler." },
          },
        },
      };
    case "summarize":
      return {
        kind: "summarize",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: `Direct content to summarize for ${provide.name}` },
            paths: { type: "array", items: { type: "string" }, description: "Optional file or workspace paths to summarize." },
            maxSentences: { type: "integer", description: "Optional upper bound for the summary length." },
            note: { type: "string", description: "Optional caller note or summary guidance." },
          },
        },
        outputSchema: {
          type: "object",
          required: ["status", "provide", "nodeId", "summary", "sourceCount"],
          properties: {
            status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
            provide: { type: "string", description: "The provide that produced the response." },
            nodeId: { type: "string", description: "The current callee nodeId." },
            summary: { type: "string", description: "Starter summary output." },
            sourceCount: { type: "number", description: "Count of text/path sources considered." },
          },
        },
      };
    case "search":
      return {
        kind: "search",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", description: `Search query for ${provide.name}` },
            paths: { type: "array", items: { type: "string" }, description: "Optional file or workspace paths to search." },
            limit: { type: "integer", description: "Maximum number of matches to return." },
            note: { type: "string", description: "Optional caller note or search hint." },
          },
        },
        outputSchema: {
          type: "object",
          required: ["status", "provide", "nodeId", "query", "matches", "total"],
          properties: {
            status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
            provide: { type: "string", description: "The provide that produced the response." },
            nodeId: { type: "string", description: "The current callee nodeId." },
            query: { type: "string", description: "Normalized query used by the search." },
            matches: {
              type: "array",
              items: {
                type: "object",
                required: ["path", "snippet"],
                properties: {
                  path: { type: "string" },
                  snippet: { type: "string" },
                },
              },
              description: "Starter match results.",
            },
            total: { type: "number", description: "Total number of matches returned." },
          },
        },
      };
    case "validate":
      return {
        kind: "validate",
        inputSchema: {
          type: "object",
          required: ["targetPath"],
          properties: {
            targetPath: { type: "string", description: `Target path or package to validate for ${provide.name}` },
            note: { type: "string", description: "Optional caller note or validation scope." },
          },
        },
        outputSchema: {
          type: "object",
          required: ["status", "provide", "nodeId", "pass", "findings"],
          properties: {
            status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
            provide: { type: "string", description: "The provide that produced the response." },
            nodeId: { type: "string", description: "The current callee nodeId." },
            pass: { type: "boolean", description: "Starter validation verdict." },
            findings: {
              type: "array",
              items: {
                type: "object",
                required: ["level", "message"],
                properties: {
                  level: { type: "string", enum: ["info", "warning", "error"] },
                  message: { type: "string" },
                },
              },
              description: "Starter validation findings.",
            },
          },
        },
      };
    case "extract_tasks":
      return {
        kind: "extract_tasks",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: `Direct content to inspect for ${provide.name}` },
            paths: { type: "array", items: { type: "string" }, description: "Optional file or workspace paths to inspect." },
            includeCompleted: { type: "boolean", description: "Whether completed tasks should remain in the output." },
            note: { type: "string", description: "Optional caller note or extraction hint." },
          },
        },
        outputSchema: {
          type: "object",
          required: ["status", "provide", "nodeId", "tasks", "sourceCount"],
          properties: {
            status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
            provide: { type: "string", description: "The provide that produced the response." },
            nodeId: { type: "string", description: "The current callee nodeId." },
            tasks: {
              type: "array",
              items: {
                type: "object",
                required: ["title", "completed"],
                properties: {
                  title: { type: "string" },
                  completed: { type: "boolean" },
                },
              },
              description: "Starter extracted tasks.",
            },
            sourceCount: { type: "number", description: "Count of sources inspected." },
          },
        },
      };
    case "answer":
      return {
        kind: "answer",
        inputSchema: {
          type: "object",
          required: ["question"],
          properties: {
            question: { type: "string", description: `Question to answer for ${provide.name}` },
            contextPaths: { type: "array", items: { type: "string" }, description: "Optional file or workspace paths that constrain the answer." },
            note: { type: "string", description: "Optional caller note or answer guidance." },
          },
        },
        outputSchema: {
          type: "object",
          required: ["status", "provide", "nodeId", "answer"],
          properties: {
            status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
            provide: { type: "string", description: "The provide that produced the response." },
            nodeId: { type: "string", description: "The current callee nodeId." },
            answer: { type: "string", description: "Starter answer output." },
            citations: {
              type: "array",
              items: {
                type: "object",
                required: ["path", "quote"],
                properties: {
                  path: { type: "string" },
                  quote: { type: "string" },
                },
              },
              description: "Optional supporting citations.",
            },
          },
        },
      };
    case "classify":
      return {
        kind: "classify",
        inputSchema: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string", description: `Text to classify for ${provide.name}` },
            labels: { type: "array", items: { type: "string" }, description: "Optional allowed labels for classification." },
            note: { type: "string", description: "Optional caller note or classification hint." },
          },
        },
        outputSchema: {
          type: "object",
          required: ["status", "provide", "nodeId", "label", "confidence"],
          properties: {
            status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
            provide: { type: "string", description: "The provide that produced the response." },
            nodeId: { type: "string", description: "The current callee nodeId." },
            label: { type: "string", description: "Starter classification label." },
            confidence: { type: "number", description: "Starter confidence score between 0 and 1." },
          },
        },
      };
    default:
      return {
        kind: "generic",
        inputSchema: {
          type: "object",
          properties: {
            note: { type: "string", description: `Optional starter input for ${provide.name}` },
          },
        },
        outputSchema: {
          type: "object",
          required: ["status", "provide", "nodeId"],
          properties: {
            status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
            provide: { type: "string", description: "The provide that produced the response." },
            nodeId: { type: "string", description: "The current callee nodeId." },
            receivedNote: { type: "string", description: "Optional note echoed from the input." },
          },
        },
      };
  }
}

function createStarterSchemas(provide: ScaffoldProvideInput): {
  inputSchema: JSONSchemaLite;
  outputSchema: JSONSchemaLite;
} {
  const blueprint = inferProvideBlueprint(provide);
  return {
    inputSchema: blueprint.inputSchema,
    outputSchema: blueprint.outputSchema,
  };
}

function createManagerProvideSchemas(
  workerNodeId: string,
  workerProvideName: string,
  workerMode: CollaboratingWorkerMode,
): { inputSchema: JSONSchemaLite; outputSchema: JSONSchemaLite } {
  return {
    inputSchema: {
      type: "object",
      required: ["task"],
      properties: {
        task: { type: "string", description: "Task to delegate to the worker node." },
        note: { type: "string", description: "Optional structured note for the worker." },
      },
    },
    outputSchema: {
      type: "object",
      required: ["status", "managerNodeId", "workerNodeId", "workerProvide", "workerMode", "workerResult"],
      properties: {
        status: { type: "string", enum: ["delegated"] },
        managerNodeId: { type: "string" },
        workerNodeId: { type: "string", enum: [workerNodeId] },
        workerProvide: { type: "string", enum: [workerProvideName] },
        workerMode: { type: "string", enum: [workerMode] },
        workerResult: {
          type: "object",
          required: ["status", "workerNodeId", "workerMode", "result"],
          properties: {
            status: { type: "string", enum: ["completed"] },
            workerNodeId: { type: "string", enum: [workerNodeId] },
            workerMode: { type: "string", enum: [workerMode] },
            result: { type: "string" },
            promptUsed: { type: "boolean" },
            promptPath: { type: "string" },
          },
        },
      },
    },
  };
}

function createWorkerProvideSchemas(
  workerMode: CollaboratingWorkerMode,
  generateInternalPromptFiles: boolean,
): { inputSchema: JSONSchemaLite; outputSchema: JSONSchemaLite } {
  return {
    inputSchema: {
      type: "object",
      required: ["task"],
      properties: {
        task: { type: "string", description: "Task for the worker to perform." },
        note: { type: "string", description: "Optional manager-supplied note." },
      },
    },
    outputSchema: {
      type: "object",
      required: ["status", "workerNodeId", "workerMode", "result"],
      properties: {
        status: { type: "string", enum: ["completed"] },
        workerNodeId: { type: "string" },
        workerMode: { type: "string", enum: [workerMode] },
        result: { type: "string" },
        promptUsed: { type: "boolean", enum: generateInternalPromptFiles ? [true, false] : [false] },
        promptPath: { type: "string" },
      },
    },
  };
}

function createCollaboratingPackageFiles(options: {
  packageName: string;
  nodeId: string;
  packageVersion: string;
  sdkDependency: ResolvedSdkDependency;
  strictTypes: boolean;
  generateDebugCommands: boolean;
  manifest: PiProtocolManifest;
  handlersFile: string;
  readme: string;
  schemas: Record<string, JSONSchemaLite>;
  extraFiles?: Record<string, string>;
}): Record<string, string> {
  const files: Record<string, string> = {
    "package.json": renderJson({
      name: options.packageName,
      version: options.packageVersion,
      type: "module",
      keywords: ["pi-package", "pi-protocol"],
      dependencies: {
        [options.sdkDependency.packageName]: options.sdkDependency.versionSpec,
      },
      peerDependencies: {
        "@mariozechner/pi-coding-agent": "*",
      },
      devDependencies: {
        "@mariozechner/pi-coding-agent": PI_CODING_AGENT_VERSION,
        "@types/node": NODE_TYPES_VERSION,
        "typescript": TYPESCRIPT_VERSION,
      },
      pi: {
        extensions: ["./extensions"],
      },
    }),
    "pi.protocol.json": renderJson(options.manifest),
    "tsconfig.json": renderJson({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        resolveJsonModule: true,
        allowImportingTsExtensions: true,
        verbatimModuleSyntax: true,
        types: ["node"],
        strict: options.strictTypes,
        skipLibCheck: true,
      },
      include: ["extensions/**/*.ts", "protocol/**/*.ts"],
    }),
    "extensions/index.ts": renderExtensionFile({
      packageName: options.packageName,
      packageVersion: options.packageVersion,
      nodeId: options.nodeId,
      generateDebugCommands: options.generateDebugCommands,
    }),
    "protocol/handlers.ts": options.handlersFile,
    "README.md": options.readme,
  };

  for (const [schemaPath, schema] of Object.entries(options.schemas)) {
    files[schemaPath] = renderJson(schema);
  }

  for (const [extraPath, content] of Object.entries(options.extraFiles ?? {})) {
    files[extraPath] = content;
  }

  return files;
}

function renderExtensionFile(options: {
  packageName: string;
  packageVersion: string;
  nodeId: string;
  generateDebugCommands: boolean;
}): string {
  const debugBlock = options.generateDebugCommands
    ? `\n\ninterface CommandContext {\n  ui: {\n    notify: (message: string, level?: "info" | "error") => void;\n  };\n}\n`
    : "";

  const debugCommand = options.generateDebugCommands
    ? `\n  pi.registerCommand?.("${commandBase(options.packageName)}-registry", {\n    description: "Show the current protocol registry snapshot",\n    handler: async (_args: string, ctx: CommandContext) => {\n      ctx.ui.notify(JSON.stringify(fabric.getRegistry(), null, 2), "info");\n    },\n  });`
    : "";

  return `import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  ensureProtocolAgentProjection,
  ensureProtocolFabric,
  registerProtocolNode,
  type ProtocolAgentProjectionTarget,
} from "@kyvernitria/pi-protocol-sdk";
import manifest from "../pi.protocol.json" with { type: "json" };
import * as handlers from "../protocol/handlers.ts";${debugBlock}
export default function activate(pi: ExtensionAPI) {
  const fabric = ensureProtocolFabric(pi);

  pi.on("session_start", async () => {
    ensureProtocolAgentProjection(pi as ProtocolAgentProjectionTarget, fabric);
    if (!fabric.describe(manifest.nodeId)) {
      registerProtocolNode(pi, fabric, {
        manifest,
        handlers,
        source: {
          packageName: ${JSON.stringify(options.packageName)},
          packageVersion: ${JSON.stringify(options.packageVersion)},
        },
      });
    }
  });

  pi.on("session_shutdown", async () => {
    if (fabric.describe(manifest.nodeId)) {
      fabric.unregisterNode(manifest.nodeId);
    }
  });${debugCommand}

  return fabric;
}
`;
}

// Render stubs that already resemble the intended protocol shape so humans have less TODO surgery to do.
function renderProvideHandlerBlock(nodeId: string, provide: ScaffoldProvideInput): string {
  const baseName = toPascalCase(provide.name);
  const blueprint = inferProvideBlueprint(provide);

  switch (blueprint.kind) {
    case "ping":
      return `interface ${baseName}Input {
  note?: string;
}

interface ${baseName}Output {
  status: "ok";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  response: "pong";
  echoedNote?: string;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  return {
    status: "ok",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    response: "pong",
    echoedNote: typeof input.note === "string" ? input.note : undefined,
  };
};`;
    case "summarize":
      return `interface ${baseName}Input {
  text?: string;
  paths?: string[];
  maxSentences?: number;
  note?: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  summary: string;
  sourceCount: number;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  const sourceText = typeof input.text === "string" ? input.text.trim() : "";
  const paths = Array.isArray(input.paths) ? input.paths.filter((value): value is string => typeof value === "string") : [];
  const preview =
    sourceText ||
    (typeof input.note === "string" ? input.note.trim() : "") ||
    (paths.length > 0 ? "from " + paths.length + " path(s)" : "no source text provided");

  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    summary: "todo: summarize " + preview.slice(0, 160),
    sourceCount: paths.length + (sourceText ? 1 : 0),
  };
};`;
    case "search":
      return `interface ${baseName}Input {
  query: string;
  paths?: string[];
  limit?: number;
  note?: string;
}

interface ${baseName}Match {
  path: string;
  snippet: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  query: string;
  matches: ${baseName}Match[];
  total: number;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    query: input.query,
    matches: [],
    total: 0,
  };
};`;
    case "validate":
      return `interface ${baseName}Input {
  targetPath: string;
  note?: string;
}

interface ${baseName}Finding {
  level: "info" | "warning" | "error";
  message: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  pass: boolean;
  findings: ${baseName}Finding[];
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    pass: false,
    findings: [
      {
        level: "info",
        message: "todo: validate " + input.targetPath,
      },
    ],
  };
};`;
    case "extract_tasks":
      return `interface ${baseName}Input {
  text?: string;
  paths?: string[];
  includeCompleted?: boolean;
  note?: string;
}

interface ${baseName}Task {
  title: string;
  completed: boolean;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  tasks: ${baseName}Task[];
  sourceCount: number;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  const paths = Array.isArray(input.paths) ? input.paths.filter((value): value is string => typeof value === "string") : [];
  const sourceCount = paths.length + (typeof input.text === "string" && input.text.trim().length > 0 ? 1 : 0);

  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    tasks: [],
    sourceCount,
  };
};`;
    case "answer":
      return `interface ${baseName}Input {
  question: string;
  contextPaths?: string[];
  note?: string;
}

interface ${baseName}Citation {
  path: string;
  quote: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  answer: string;
  citations?: ${baseName}Citation[];
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    answer: "todo: answer " + input.question,
    citations: [],
  };
};`;
    case "classify":
      return `interface ${baseName}Input {
  text: string;
  labels?: string[];
  note?: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  label: string;
  confidence: number;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  const fallbackLabel = Array.isArray(input.labels) && input.labels.length > 0 ? input.labels[0] : "unclassified";

  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    label: fallbackLabel,
    confidence: 0,
  };
};`;
    default:
      return `interface ${baseName}Input {
  note?: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  receivedNote?: string;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    receivedNote: typeof input.note === "string" ? input.note : undefined,
  };
};`;
  }
}

function renderHandlersFile(nodeId: string, provides: ScaffoldProvideInput[]): string {
  const blocks = provides.map((provide) => renderProvideHandlerBlock(nodeId, provide)).join("\n\n");

  return `import type { ProtocolHandler } from "@kyvernitria/pi-protocol-sdk";

// ${nodeId} starter handlers
// Each handler keeps the public protocol contract typed, even when the implementation is still a TODO.
${blocks}
`;
}

function renderManagerHandlersFile(input: ScaffoldCollaboratingNodesInput): string {
  const managerInterface = toPascalCase(input.managerProvideName);
  const workerInterface = toPascalCase(input.workerProvideName);

  return `import type { ProtocolHandler } from "@kyvernitria/pi-protocol-sdk";

interface ${managerInterface}Input {
  task: string;
  note?: string;
}

interface ${workerInterface}Output {
  status: "completed";
  workerNodeId: string;
  workerMode: ${JSON.stringify(input.workerMode)};
  result: string;
  promptUsed?: boolean;
  promptPath?: string;
}

interface ${managerInterface}Output {
  status: "delegated";
  managerNodeId: string;
  workerNodeId: string;
  workerProvide: ${JSON.stringify(input.workerProvideName)};
  workerMode: ${JSON.stringify(input.workerMode)};
  workerResult: ${workerInterface}Output;
}

export const ${input.managerProvideName}: ProtocolHandler<${managerInterface}Input, ${managerInterface}Output> = async (ctx, input) => {
  const result = await ctx.delegate.invoke({
    provide: ${JSON.stringify(input.workerProvideName)},
    target: { nodeId: ${JSON.stringify(input.workerNodeId)} },
    input: {
      task: input.task,
      note: input.note,
    },
  });

  if (!result.ok) {
    const error = new Error(result.error.message) as Error & {
      code?: string;
      details?: unknown;
    };
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }

  return {
    status: "delegated",
    managerNodeId: ctx.calleeNodeId,
    workerNodeId: result.nodeId,
    workerProvide: ${JSON.stringify(input.workerProvideName)},
    workerMode: ${JSON.stringify(input.workerMode)},
    workerResult: result.output as ${workerInterface}Output,
  };
};
`;
}

function renderWorkerHandlersFile(
  input: ScaffoldCollaboratingNodesInput,
  generateInternalPromptFiles: boolean,
): string {
  const workerInterface = toPascalCase(input.workerProvideName);
  if (input.workerMode === "agent-backed") {
    const promptConstants = generateInternalPromptFiles
      ? `const INTERNAL_PROMPT_PATH = new URL("./prompts/${input.workerProvideName}.md", import.meta.url);\n`
      : "";
    const promptReadBlock = generateInternalPromptFiles
      ? `  let promptUsed = false;\n  let promptPath: string | undefined;\n\n  try {\n    await fs.readFile(INTERNAL_PROMPT_PATH, "utf8");\n    promptUsed = true;\n    promptPath = ${JSON.stringify(`protocol/prompts/${input.workerProvideName}.md`)};\n  } catch {\n    promptUsed = false;\n  }\n\n`
      : "  const promptUsed = false;\n  const promptPath: string | undefined = undefined;\n\n";

    return `import { promises as fs } from "node:fs";
import type { ProtocolHandler } from "@kyvernitria/pi-protocol-sdk";

interface ${workerInterface}Input {
  task: string;
  note?: string;
}

interface ${workerInterface}Output {
  status: "completed";
  workerNodeId: string;
  workerMode: "agent-backed";
  result: string;
  promptUsed?: boolean;
  promptPath?: string;
}

${promptConstants}export const ${input.workerProvideName}: ProtocolHandler<${workerInterface}Input, ${workerInterface}Output> = async (ctx, input) => {
${promptReadBlock}  return {
    status: "completed",
    workerNodeId: ctx.calleeNodeId,
    workerMode: "agent-backed",
    result: \`agent-backed starter completed: \${input.task}\${input.note ? \` (\${input.note})\` : ""}\`,
    promptUsed,
    promptPath,
  };
};
`;
  }

  return `import type { ProtocolHandler } from "@kyvernitria/pi-protocol-sdk";

interface ${workerInterface}Input {
  task: string;
  note?: string;
}

interface ${workerInterface}Output {
  status: "completed";
  workerNodeId: string;
  workerMode: "deterministic";
  result: string;
  promptUsed?: boolean;
  promptPath?: string;
}

export const ${input.workerProvideName}: ProtocolHandler<${workerInterface}Input, ${workerInterface}Output> = async (ctx, input) => {
  return {
    status: "completed",
    workerNodeId: ctx.calleeNodeId,
    workerMode: "deterministic",
    result: \`deterministic worker completed: \${input.task}\${input.note ? \` (\${input.note})\` : ""}\`,
    promptUsed: false,
    promptPath: undefined,
  };
};
`;
}

function renderCollaboratingReadme(options: {
  packageName: string;
  nodeId: string;
  purpose: string;
  sdkDependency: string;
  strictTypes: boolean;
  generateDebugCommands: boolean;
  collaborationRole: "manager" | "worker";
  workerMode: CollaboratingWorkerMode;
  notes: string[];
}): string {
  return `# ${options.packageName}

${options.purpose}

## Node identity

- package: ${options.packageName}
- nodeId: ${options.nodeId}
- protocolVersion: ${PROTOCOL_VERSION}
- collaboration role: ${options.collaborationRole}
- worker mode: ${options.workerMode}
- debug commands: ${options.generateDebugCommands ? "enabled" : "disabled"}
- strict TypeScript: ${options.strictTypes ? "enabled" : "disabled"}
- SDK dependency: ${options.sdkDependency}

## Notes

${options.notes.map((note) => `- ${note}`).join("\n")}
- Standard protocol projection bootstrap is batteries-included via ` + "`ensureProtocolAgentProjection(...)`" + `.
- Pi commands, tools, and other UI surfaces remain projections over the protocol rather than the protocol itself.
${options.collaborationRole === "worker" && options.workerMode === "agent-backed"
  ? "- Internal prompts stay under `protocol/prompts/` and remain non-public by default.\n"
  : ""}
## Local checklist

${CERTIFICATION_CHECKLIST.map((item) => `- [ ] ${item}`).join("\n")}
`;
}

function renderWorkerInternalPrompt(input: ScaffoldCollaboratingNodesInput): string {
  return `# Internal prompt for ${input.workerNodeId}.${input.workerProvideName}

You are implementing the internal reasoning pattern for ${input.workerNodeId}.${input.workerProvideName}.

Rules:
- Return structured output that still matches the provide schema.
- Do not expose this prompt as a Pi skill.
- Treat the protocol contract as canonical.
- If nested protocol calls are needed, use the bound protocol delegation surface provided by the runtime.
`;
}

function renderReadme(
  input: ScaffoldCertifiedNodeInput,
  useInlineSchemas: boolean,
  generateDebugCommands: boolean,
  sdkDependency: string,
  strictTypes: boolean,
): string {
  return `# ${input.packageName}

${input.purpose}

## Node identity

- package: ${input.packageName}
- nodeId: ${input.nodeId}
- protocolVersion: ${PROTOCOL_VERSION}
- schema mode: ${useInlineSchemas ? "inline" : "file-based"}
- debug commands: ${generateDebugCommands ? "enabled" : "disabled"}
- strict TypeScript: ${strictTypes ? "enabled" : "disabled"}
- SDK dependency: ${sdkDependency}

## Provides

${input.provides.map((provide) => `- ${provide.name}: ${provide.description}`).join("\n")}

## Notes

- ` + "`scaffold_extension`" + ` is a pure generation provide. It returns a file plan and file contents.
- Writing files to disk is an operator concern handled by command projections such as ` + "`/pi-pi-scaffold-extension`" + `.
- Generated bootstrap ensures the shared fabric and the standard protocol projection by default.
- Pi commands, tools, and other UI surfaces remain projections over the protocol rather than the protocol itself.
- If nested protocol calls are introduced later, prefer the bound ` + "`ctx.delegate.invoke(...)`" + ` surface.
- If you are developing locally against an unpublished SDK, replace the SDK package dependency with a local path or workspace dependency.
- The current validator is AST-assisted and source-based. It is not full semantic validation yet.

## Local checklist

${CERTIFICATION_CHECKLIST.map((item) => `- [ ] ${item}`).join("\n")}
`;
}

function describeGeneratedFile(filePath: string): string {
  if (filePath === "package.json") return "Native Pi package metadata and protocol SDK dependency";
  if (filePath === "pi.protocol.json") return "Canonical Pi Protocol manifest";
  if (filePath === "extensions/index.ts") return "Runtime bootstrap that joins the shared protocol fabric and ensures the standard protocol projection";
  if (filePath === "protocol/handlers.ts") return "Local TypeScript handler implementations";
  if (filePath.startsWith("protocol/schemas/")) return "JSON schema for a public provide";
  if (filePath.startsWith("protocol/prompts/")) return "Internal non-discoverable prompt for an agent-backed worker provide";
  if (filePath === "README.md") return "Starter package documentation";
  if (filePath === "tsconfig.json") return "TypeScript configuration for JSON imports and TS entrypoints";
  return "Generated file";
}

function renderJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function commandBase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function protocolError(code: string, message: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath: string): Promise<unknown | null> {
  if (!(await exists(filePath))) return null;
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

async function collectSourceFiles(packageDir: string): Promise<string[]> {
  const results: string[] = [];
  await walk(packageDir, results);
  return results.filter((filePath) => /\.(ts|js|mjs|cjs)$/.test(filePath));
}

async function walk(currentDir: string, results: string[]): Promise<void> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }> = [];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, results);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
}

function analyzeSourceAst(filePath: string, source: string): SourceAstAnalysis {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const importSpecifiers: string[] = [];
  const exportedNames = new Set<string>();
  const parseDiagnostics = ts.transpileModule(source, {
    fileName: filePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).diagnostics ?? [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      importSpecifiers.push(node.moduleSpecifier.text);
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      importSpecifiers.push(node.moduleSpecifier.text);
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          exportedNames.add((element.name ?? element.propertyName)?.text ?? element.name.text);
        }
      }
    }

    if (ts.isFunctionDeclaration(node) && hasExportModifier(node) && node.name) {
      exportedNames.add(node.name.text);
    }

    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          exportedNames.add(declaration.name.text);
        }
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [firstArgument] = node.arguments;
      if (firstArgument && ts.isStringLiteral(firstArgument)) {
        importSpecifiers.push(firstArgument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    sourceFile,
    parseErrors: parseDiagnostics.map((diagnostic: ts.Diagnostic) => flattenDiagnosticMessage(diagnostic.messageText)),
    importSpecifiers,
    exportedNames,
  };
}

function analyzeExtensionBootstrap(sourceFile: ts.SourceFile): ExtensionBootstrapAnalysis {
  let hasEnsureProtocolFabricCall = false;
  let hasEnsureProtocolAgentProjectionCall = false;
  let hasEnsureProtocolAgentProjectionOnSessionStart = false;
  let hasRegisterProtocolNodeCall = false;
  let hasSessionStartRegistration = false;
  let hasSessionShutdownUnregister = false;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expressionName = getCallExpressionName(node.expression);
      if (expressionName === "ensureProtocolFabric") {
        hasEnsureProtocolFabricCall = true;
      }
      if (expressionName === "ensureProtocolAgentProjection") {
        hasEnsureProtocolAgentProjectionCall = true;
      }
      if (expressionName === "registerProtocolNode") {
        hasRegisterProtocolNodeCall = true;
      }

      if (isPiEventRegistration(node, "session_start")) {
        if (callbackContainsCall(node.arguments[1], "registerProtocolNode")) {
          hasSessionStartRegistration = true;
        }
        if (callbackContainsCall(node.arguments[1], "ensureProtocolAgentProjection")) {
          hasEnsureProtocolAgentProjectionOnSessionStart = true;
        }
      }

      if (
        isPiEventRegistration(node, "session_shutdown") &&
        callbackContainsPropertyCall(node.arguments[1], "unregisterNode")
      ) {
        hasSessionShutdownUnregister = true;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    hasEnsureProtocolFabricCall,
    hasEnsureProtocolAgentProjectionCall,
    hasEnsureProtocolAgentProjectionOnSessionStart,
    hasRegisterProtocolNodeCall,
    hasSessionStartRegistration,
    hasSessionShutdownUnregister,
  };
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return (modifiers ?? []).some((modifier: ts.Modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function flattenDiagnosticMessage(messageText: string | ts.DiagnosticMessageChain): string {
  if (typeof messageText === "string") return messageText;
  const nextMessage = messageText.next?.[0];
  return nextMessage
    ? `${messageText.messageText} ${flattenDiagnosticMessage(nextMessage)}`
    : messageText.messageText;
}

function getCallExpressionName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return null;
}

function isPiEventRegistration(node: ts.CallExpression, eventName: string): boolean {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "on" &&
    node.arguments.length >= 2 &&
    ts.isStringLiteral(node.arguments[0]) &&
    node.arguments[0].text === eventName
  );
}

function callbackContainsCall(callback: ts.Expression | undefined, callName: string): boolean {
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
    return false;
  }

  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && getCallExpressionName(node.expression) === callName) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(callback.body);
  return found;
}

function callbackContainsPropertyCall(callback: ts.Expression | undefined, propertyName: string): boolean {
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
    return false;
  }

  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === propertyName
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(callback.body);
  return found;
}

function getPackageName(packageJson: unknown): string | undefined {
  if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) {
    return undefined;
  }

  const name = (packageJson as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function isForbiddenCertifiedNodeImport(specifier: string, ownPackageName?: string): boolean {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("node:")) {
    return false;
  }

  if (specifier === "@kyvernitria/pi-protocol-sdk") {
    return false;
  }

  if (specifier.startsWith("@mariozechner/pi-")) {
    return false;
  }

  if (ownPackageName && specifier === ownPackageName) {
    return false;
  }

  return /^pi-[a-z0-9-]+$/.test(specifier) || /^@[^/]+\/pi-[a-z0-9-]+$/.test(specifier);
}

function findLocalDependencyViolations(packageJson: Record<string, unknown>): ValidationRuleResult[] {
  const violations: ValidationRuleResult[] = [];
  const dependencySections = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const;

  for (const section of dependencySections) {
    const dependencies = packageJson[section];
    if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
      continue;
    }

    for (const [name, version] of Object.entries(dependencies as Record<string, unknown>)) {
      if (typeof version !== "string") continue;
      if (!isNonStandaloneDependencyVersion(version)) continue;
      violations.push({
        rule: `package-json.${section}.non-standalone.${name}`,
        message: `${section}.${name} uses non-standalone version ${version}`,
        suggestedFix:
          "Replace repo-local file/link/workspace dependencies with a published semver dependency or vendor an equivalent shim for standalone installability.",
      });
    }
  }

  return violations;
}

function isNonStandaloneDependencyVersion(version: string): boolean {
  return /^(file:|link:|workspace:)/.test(version);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
