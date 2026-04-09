import path from "node:path";
import { dedupe, exists, protocolError, readJsonIfExists } from "./core-shared.ts";
import { validatePlanningInput, validateBrownfieldPlanningInput } from "./validation.ts";
import {
  buildBrownfieldCapabilityMap,
  buildBrownfieldMigrationSteps,
  buildBrownfieldPatchGuidance,
  buildBrownfieldProvideProposals,
  buildBrownfieldReuseRecommendations,
  collectBrownfieldFiles,
  collectCommandHints,
  createExplicitProvideFromName,
  detectCapabilityKinds,
  derivePlanningPolicy,
  extractExplicitPackageNameFromBrief,
  extractExplicitProvideNamesFromBrief,
  inferBaseNameFromBrief,
  inferManagerProvideName,
  inferSingleNodePurpose,
  inferWorkerProvideName,
  mentionsAny,
  normalizeWhitespace,
  resolveInternalInstruction,
} from "./planner-policy.ts";
import { inferCandidateProvidesFromBrief } from "./provide-blueprints.ts";
import type {
  CollaboratingWorkerMode,
  PlanBrownfieldMigrationInput,
  PlanBrownfieldMigrationOutput,
  PlanCertifiedNodeFromDescriptionInput,
  PlanCertifiedNodeFromDescriptionOutput,
  ScaffoldCertifiedNodeInput,
  ScaffoldCollaboratingNodesInput,
} from "./contracts.ts";
import type { ProtocolHandler } from "../vendor/pi-protocol-sdk.ts";

export async function planCertifiedNodeFromDescription(
  input: PlanCertifiedNodeFromDescriptionInput,
): Promise<PlanCertifiedNodeFromDescriptionOutput> {
  validatePlanningInput(input);

  const brief = normalizeWhitespace(input.description);
  const instruction = await resolveInternalInstruction("plan-extension-from-brief");
  const policy = derivePlanningPolicy(instruction.content);
  const lowerBrief = brief.toLowerCase();
  const operatorCommandProjectionSuggested = mentionsAny(lowerBrief, [
    "slash command",
    "command",
    "operator",
    "local use",
    "cli",
  ]);

  const explicitPackageName = extractExplicitPackageNameFromBrief(lowerBrief);
  const explicitProvideNames = extractExplicitProvideNamesFromBrief(lowerBrief);
  const candidateProvides =
    explicitProvideNames.length > 0
      ? explicitProvideNames.map((name) => createExplicitProvideFromName(name, brief))
      : inferCandidateProvidesFromBrief(lowerBrief);
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
  const baseName = explicitPackageName?.replace(/^pi-/, "") || inferBaseNameFromBrief(lowerBrief);

  if (policy.prefersSingleNodeByDefault && !pairRecommended) {
    assumptions.push("Defaulted to a single certified node because the brief did not strongly require cross-node delegation.");
  }

  if (!mentionsAny(lowerBrief, ["other nodes", "callable", "public provide", "protocol"])) {
    assumptions.push("Assumed the package should still expose at least one public provide so it remains capability-first.");
  }

  if (operatorCommandProjectionSuggested) {
    assumptions.push("Included an operator-facing command projection suggestion because the brief mentioned command/operator use.");
  }

  if (explicitPackageName) {
    assumptions.push(`Used the explicit requested package name ${explicitPackageName}.`);
  }

  if (explicitProvideNames.length > 0) {
    assumptions.push("Used the explicit requested public provide names from the brief instead of inferring a generic starter surface.");
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
      },
      collaboratingNodesScaffoldInput,
    };
  }

  const singleNodeScaffoldInput: ScaffoldCertifiedNodeInput = {
    packageName: explicitPackageName ?? `pi-${baseName}`,
    nodeId: explicitPackageName ?? `pi-${baseName}`,
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
    },
    singleNodeScaffoldInput,
  };
}

export async function planBrownfieldMigration(
  input: PlanBrownfieldMigrationInput,
): Promise<PlanBrownfieldMigrationOutput> {
  validateBrownfieldPlanningInput(input);

  const repoDir = path.resolve(input.repoDir);
  const instruction = await resolveInternalInstruction("plan-existing-repo-migration");
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
    },
    sourceFiles,
    fileHints: input.includeFileHints ? fileHints : undefined,
  };
}
