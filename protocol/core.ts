import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type {
  JSONSchemaLite,
  ProtocolHandler,
  PiProtocolManifest,
} from "../vendor/pi-protocol-sdk.ts";

export const PROTOCOL_VERSION = "0.1.0";
export const SDK_DEPENDENCY = "^0.1.0";
export const PI_CODING_AGENT_VERSION = "^0.65.2";
export const NODE_TYPES_VERSION = "^24.5.2";
export const TYPESCRIPT_VERSION = "^5.9.3";
export const VALIDATION_MODE = "ast-assisted-source";

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
      "ship pi.protocol.json as the canonical protocol contract",
    ],
    toolingProvides: [
      "describe_certified_template",
      "plan_certified_node_from_description",
      "scaffold_certified_node",
      "scaffold_collaborating_nodes",
      "validate_certified_node",
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
          '/pi-pi-plan Build me a certified extension that summarizes markdown notes and also offers a local command.',
          '/pi-pi-new {"packageName":"pi-hello","nodeId":"pi-hello","purpose":"Greets users","provides":[{"name":"say_hello","description":"Return a greeting."}]}',
          '/pi-pi-new-pair {"managerPackageName":"pi-manager","managerNodeId":"pi-manager","workerPackageName":"pi-worker","workerNodeId":"pi-worker","managerProvideName":"delegate_task","workerProvideName":"do_task","workerMode":"deterministic"}',
          "/pi-pi-validate ./packages/pi-hello",
        ]
      : [],
    notes: [
      "scaffold_certified_node is a pure generation provide that returns a file plan and file contents.",
      "plan_certified_node_from_description is a pure planning provide that turns a natural-language brief into scaffold-ready structured output.",
      "scaffold_collaborating_nodes is a pure generation provide that returns two package plans and their file contents.",
      "Certified package bootstrap should ensure both the shared fabric and the standard protocol projection.",
      "ctx.delegate is the preferred bound delegation surface for recursive cross-node calls because trace, caller, and budget context stay attached automatically.",
      "Agent-backed worker mode is currently an agent-backed-ready scaffold pattern, not a fully realized embedded Pi agent runtime.",
      "/pi-pi-new and /pi-pi-new-pair are Pi command projections that may optionally write generated files to disk.",
      "Commands and tools are projections over the protocol, not the protocol itself.",
      `validate_certified_node currently uses ${VALIDATION_MODE} checks rather than full semantic validation.`,
    ],
  };
}

export async function planCertifiedNodeFromDescription(
  input: PlanCertifiedNodeFromDescriptionInput,
): Promise<PlanCertifiedNodeFromDescriptionOutput> {
  validatePlanningInput(input);

  const brief = normalizeWhitespace(input.description);
  const instruction = await resolveInternalInstruction(
    "plan-certified-node-from-description",
    ["interpret-extension-brief.md"],
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

  const pairRecommended =
    input.preferCollaboration === true ||
    mentionsAny(lowerBrief, [
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

  const provideName = inferSingleProvideName(lowerBrief);
  const singleNodeScaffoldInput: ScaffoldCertifiedNodeInput = {
    packageName: `pi-${baseName}`,
    nodeId: `pi-${baseName}`,
    purpose: inferSingleNodePurpose(lowerBrief, baseName),
    provides: [
      {
        name: provideName,
        description: inferSingleProvideDescription(lowerBrief, provideName),
      },
    ],
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

export async function scaffoldCertifiedNode(
  input: ScaffoldCertifiedNodeInput,
): Promise<ScaffoldCertifiedNodeOutput> {
  validateScaffoldInput(input);

  const packageVersion = input.packageVersion?.trim() || "0.1.0";
  const sdkDependency = input.sdkDependency?.trim() || SDK_DEPENDENCY;
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
        "@kyvernitria/pi-protocol-sdk": sdkDependency,
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
    "README.md": renderReadme(input, useInlineSchemas, generateDebugCommands, sdkDependency, strictTypes),
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
    sdkDependency,
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
      "Use a Pi command projection such as /pi-pi-new if you want operator-driven file writing.",
      "Generated bootstrap ensures the shared fabric and the standard protocol projection by default.",
      `The generated package stamps @kyvernitria/pi-protocol-sdk@${sdkDependency}. Override sdkDependency for local development if needed.`,
    ],
  };
}

export async function scaffoldCollaboratingNodes(
  input: ScaffoldCollaboratingNodesInput,
): Promise<ScaffoldCollaboratingNodesOutput> {
  validateCollaboratingNodesInput(input);

  const packageVersion = input.packageVersion?.trim() || "0.1.0";
  const sdkDependency = input.sdkDependency?.trim() || SDK_DEPENDENCY;
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
      sdkDependency,
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
      sdkDependency,
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
    sdkDependency,
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

export async function validateCertifiedNode(
  input: ValidateCertifiedNodeInput,
): Promise<ValidateCertifiedNodeOutput> {
  if (!input || typeof input !== "object" || !input.packageDir?.trim()) {
    throw protocolError("INVALID_INPUT", "validate_certified_node requires a non-empty packageDir");
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

export const describe_certified_template: ProtocolHandler = async (_ctx, input) =>
  describeCertifiedTemplate((input ?? {}) as TemplateDescribeInput);

export const plan_certified_node_from_description: ProtocolHandler = async (_ctx, input) =>
  planCertifiedNodeFromDescription(input as PlanCertifiedNodeFromDescriptionInput);

export const scaffold_certified_node: ProtocolHandler = async (_ctx, input) =>
  scaffoldCertifiedNode(input as ScaffoldCertifiedNodeInput);

export const scaffold_collaborating_nodes: ProtocolHandler = async (_ctx, input) =>
  scaffoldCollaboratingNodes(input as ScaffoldCollaboratingNodesInput);

export const validate_certified_node: ProtocolHandler = async (_ctx, input) =>
  validateCertifiedNode(input as ValidateCertifiedNodeInput);

function validatePlanningInput(input: PlanCertifiedNodeFromDescriptionInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "plan_certified_node_from_description requires an input object");
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

function validateScaffoldInput(input: ScaffoldCertifiedNodeInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "scaffold_certified_node requires an input object");
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
    throw protocolError("INVALID_INPUT", "scaffold_collaborating_nodes requires an input object");
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

interface PlanningPolicy {
  prefersSingleNodeByDefault: boolean;
  deterministicFirstOnlyWhenExplicitlyAbsent: boolean;
}

async function resolveInternalInstruction(
  taskBaseName: string,
  aliases: string[] = [],
): Promise<ResolvedInternalInstruction> {
  const candidates = [`${taskBaseName}.md`, ...aliases, "default.md"];

  for (const candidate of candidates) {
    const absolutePath = path.resolve("protocol", "instructions", candidate);
    if (await exists(absolutePath)) {
      return {
        absolutePath,
        relativePath: path.relative(process.cwd(), absolutePath).replaceAll(path.sep, "/"),
        content: await fs.readFile(absolutePath, "utf8"),
        fallbackUsed: candidate === "default.md",
      };
    }
  }

  throw protocolError(
    "EXECUTION_FAILED",
    `No internal instruction file found for ${taskBaseName}. Expected protocol/instructions/${taskBaseName}.md or protocol/instructions/default.md`,
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

function mentionsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function inferBaseNameFromBrief(brief: string): string {
  if (mentionsAny(brief, ["markdown", "notes"])) return "notes-planner";
  if (mentionsAny(brief, ["summary", "summarize"])) return "summarizer";
  if (mentionsAny(brief, ["research"])) return "research";
  if (mentionsAny(brief, ["validate", "validation"])) return "validator";
  if (mentionsAny(brief, ["search"])) return "search";

  const tokens = brief
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .filter((token) => !COMMON_BRIEF_STOPWORDS.has(token))
    .slice(0, 2);

  return tokens.length > 0 ? tokens.join("-") : "planned-node";
}

function inferSingleProvideName(brief: string): string {
  if (mentionsAny(brief, ["markdown", "notes"]) && mentionsAny(brief, ["summary", "summarize"])) {
    return "summarize_notes";
  }
  if (mentionsAny(brief, ["search"]) && mentionsAny(brief, ["notes", "docs", "documents"])) {
    return "search_notes";
  }
  if (mentionsAny(brief, ["validate", "validation"])) {
    return "validate_package";
  }
  return "handle_request";
}

function inferSingleProvideDescription(brief: string, provideName: string): string {
  if (provideName === "summarize_notes") {
    return "Summarize markdown notes or similar workspace text into a typed protocol response.";
  }
  if (provideName === "search_notes") {
    return "Search workspace notes and return typed matches or summaries.";
  }
  if (provideName === "validate_package") {
    return "Validate a target package or repo request and return a typed assessment.";
  }
  return `Handle the described capability from the brief: ${normalizeWhitespace(brief).slice(0, 120)}.`;
}

function inferSingleNodePurpose(brief: string, baseName: string): string {
  if (mentionsAny(brief, ["markdown", "notes"]) && mentionsAny(brief, ["summary", "summarize"])) {
    return "Summarizes markdown notes through a TypeScript-first certified protocol package.";
  }
  if (mentionsAny(brief, ["search"])) {
    return "Searches a target knowledge domain through a TypeScript-first certified protocol package.";
  }
  return `Implements ${baseName.replaceAll("-", " ")} through a TypeScript-first certified protocol package.`;
}

function inferManagerProvideName(brief: string): string {
  if (mentionsAny(brief, ["research"])) return "delegate_research";
  return "delegate_task";
}

function inferWorkerProvideName(brief: string): string {
  if (mentionsAny(brief, ["research"])) return "perform_research";
  if (mentionsAny(brief, ["summary", "summarize"])) return "do_summary";
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

function createStarterSchemas(provide: ScaffoldProvideInput): {
  inputSchema: JSONSchemaLite;
  outputSchema: JSONSchemaLite;
} {
  return {
    inputSchema: {
      type: "object",
      properties: {
        note: {
          type: "string",
          description: `Optional starter input for ${provide.name}`,
        },
      },
    },
    outputSchema: {
      type: "object",
      required: ["status", "provide", "nodeId"],
      properties: {
        status: {
          type: "string",
          enum: ["todo"],
          description: "Starter status returned by the scaffolded handler.",
        },
        provide: {
          type: "string",
          description: "The provide that produced the response.",
        },
        nodeId: {
          type: "string",
          description: "The current callee nodeId.",
        },
        receivedNote: {
          type: "string",
          description: "Optional note echoed from the input.",
        },
      },
    },
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
  sdkDependency: string;
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
        "@kyvernitria/pi-protocol-sdk": options.sdkDependency,
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

function renderHandlersFile(nodeId: string, provides: ScaffoldProvideInput[]): string {
  const blocks = provides
    .map((provide) => {
      const baseName = toPascalCase(provide.name);
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
    })
    .join("\n\n");

  return `import type { ProtocolHandler } from "@kyvernitria/pi-protocol-sdk";

// ${nodeId} starter handlers
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
- SDK dependency: @kyvernitria/pi-protocol-sdk@${options.sdkDependency}

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
- SDK dependency: @kyvernitria/pi-protocol-sdk@${sdkDependency}

## Provides

${input.provides.map((provide) => `- ${provide.name}: ${provide.description}`).join("\n")}

## Notes

- ` + "`scaffold_certified_node`" + ` is a pure generation provide. It returns a file plan and file contents.
- Writing files to disk is an operator concern handled by command projections such as ` + "`/pi-pi-new`" + `.
- Generated bootstrap ensures the shared fabric and the standard protocol projection by default.
- Pi commands, tools, and other UI surfaces remain projections over the protocol rather than the protocol itself.
- If nested protocol calls are introduced later, prefer the bound ` + "`ctx.delegate.invoke(...)`" + ` surface.
- If you are developing locally against an unpublished SDK, replace ` + "`@kyvernitria/pi-protocol-sdk`" + ` with a local path or workspace dependency.
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

      if (isPiEventRegistration(node, "session_start") && callbackContainsCall(node.arguments[1], "registerProtocolNode")) {
        hasSessionStartRegistration = true;
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
