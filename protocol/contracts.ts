export interface TemplateDescribeInput {
  includeCommandExamples?: boolean;
}

export interface GeneratedPackageDefaults {
  sdkDistribution: "vendored-shim";
  sdkSourceOfTruth: "vendor/pi-protocol-sdk.ts";
  useInlineSchemasDefault: boolean;
  generateDebugCommandsDefault: boolean;
  strictTypesDefault: boolean;
  validationMode: "ast-assisted-source";
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
  repoDir?: string;
  replaceExisting?: boolean;
  applyChanges?: boolean;
}

export interface BuiltCertifiedPackageSummary {
  packageName: string;
  nodeId: string;
  packageDir: string;
  changedFiles: string[];
  provides: string[];
}

export interface RuntimeVerificationSummary {
  packageCount: number;
  registeredNodeIds: string[];
  invokedProvides: string[];
}

export interface BuildCertifiedExtensionOutput {
  status: "source_validated" | "runtime_verified";
  repoDir: string;
  buildMode: "greenfield-single-node" | "greenfield-pair" | "brownfield-single-node";
  applied: boolean;
  packages: BuiltCertifiedPackageSummary[];
  changedFiles: string[];
  validation: {
    pass: true;
    validationMode: "ast-assisted-source";
    packageCount: number;
  };
  verification: {
    sdkDistribution: "vendored-shim";
    sdkSourceOfTruth: "vendor/pi-protocol-sdk.ts";
    stages: {
      sourceGenerated: true;
      sourceValidated: true;
      dependenciesResolved: true;
      packageInstallable: true;
      packageLoadable: true;
      nodeRegistered: true;
      publicProvideInvokable: true;
      targetFilesApplied: boolean;
      targetRuntimeVerified: boolean;
    };
    stagedRuntime: RuntimeVerificationSummary;
    targetRuntime?: RuntimeVerificationSummary;
  };
  assumptions: string[];
  summary: string;
}

export type ContinuationState = "awaiting_user" | "awaiting_caller" | "closed";

export interface ConversationalOwner {
  nodeId: string;
  provide: string;
  label?: string;
}

export interface ConversationalContinuation {
  token: string;
  state: ContinuationState;
  owner: ConversationalOwner;
}

export interface ChatPiPiInput {
  message: string;
  conversationToken?: string;
  repoDir?: string;
  applyChanges?: boolean;
  replaceExisting?: boolean;
}

export interface ChatPiPiOutput {
  status: "clarification_needed" | "completed" | "unsupported";
  reply: string;
  questions?: string[];
  missingInformation?: string[];
  assumptionsOffered?: string[];
  canProceedWithAssumptions?: boolean;
  reasons?: string[];
  build?: BuildCertifiedExtensionOutput;
  continuation?: ConversationalContinuation;
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
  sdkDistribution: "vendored-shim";
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
  sdkDistribution: "vendored-shim";
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
  validationMode: "ast-assisted-source";
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
