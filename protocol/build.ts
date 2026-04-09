import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  GENERATED_SDK_DISTRIBUTION,
  GENERATED_SDK_FILE,
  VALIDATION_MODE,
} from "./constants.ts";
import { mentionsAny, normalizeWhitespace } from "./planner-policy.ts";
import {
  clearDirectoryPreservingGit,
  classifyCertifiedBuildRepo,
  ensureCertifiedNodeId,
  ensureCertifiedPackageName,
  runRuntimeSmokeVerification,
  writeGeneratedFiles,
} from "./builder-support.ts";
import {
  dedupe,
  protocolError,
} from "./core-shared.ts";
import {
  planBrownfieldMigration,
  planCertifiedNodeFromDescription,
} from "./planning.ts";
import {
  scaffoldCertifiedNode,
  scaffoldCollaboratingNodes,
} from "./scaffolding.ts";
import { validateCertifiedNode } from "./validation.ts";
import type {
  BuildCertifiedExtensionInput,
  BuildCertifiedExtensionOutput,
  BuiltCertifiedPackageSummary,
  PlanBrownfieldMigrationInput,
  PlanBrownfieldMigrationOutput,
  PlanCertifiedNodeFromDescriptionInput,
  PlanCertifiedNodeFromDescriptionOutput,
  RuntimeVerificationSummary,
  ScaffoldCertifiedNodeInput,
  ScaffoldCertifiedNodeOutput,
  ScaffoldCollaboratingNodesInput,
  ScaffoldCollaboratingNodesOutput,
  ValidateCertifiedNodeInput,
  ValidateCertifiedNodeOutput,
} from "./contracts.ts";

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
  const unsupportedReasons = findUnsupportedCertifiedBuilderReasons(description);
  if (unsupportedReasons.length > 0) {
    throw protocolError(
      "INVALID_INPUT",
      `pi-pi currently supports typed Pi Protocol packages with public provides, not arbitrary Pi bootstrap/TUI/extension-loading behavior. This brief asks for ${unsupportedReasons.join(", ")}. Use a dedicated installed capability if one exists, or implement that extension manually instead of claiming a certified protocol-package build.`,
      {
        unsupportedBriefReasons: unsupportedReasons,
      },
    );
  }

  const repoDir = path.resolve(input.repoDir?.trim() || process.cwd());
  const applyChanges = input.applyChanges ?? true;
  const repoState = await classifyCertifiedBuildRepo(repoDir);
  const assumptions: string[] = [];

  if (!input.repoDir?.trim()) {
    assumptions.push("repoDir defaulted to the current working directory.");
  }

  if (repoState.kind === "brownfield" && input.replaceExisting !== true) {
    throw protocolError(
      "INVALID_INPUT",
      "pi-pi found existing repository content. Re-run with replaceExisting:true so it can replace that directory with a certified build instead of improvising a partial non-certified migration.",
    );
  }

  let buildMode: BuildCertifiedExtensionOutput["buildMode"];
  let artifacts: BuildArtifact[] = [];

  try {
    const plan = await runtime.invokeInternal<PlanCertifiedNodeFromDescriptionOutput>(
      "plan_extension_from_brief",
      {
        description,
      },
    );

    assumptions.push(...plan.assumptions, ...plan.clarificationNotes);

    if (repoState.kind === "greenfield") {
      if (plan.recommendedShape === "collaborating-pair") {
        if (!plan.collaboratingNodesScaffoldInput) {
          throw protocolError("EXECUTION_FAILED", "planner did not return collaboratingNodesScaffoldInput", {
            stage: "generation_failure",
          });
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
          "pi-pi currently exposes brownfield replacement only as a single certified package. Use a fresh repo for pair mode or split the migration into separate certified packages.",
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
  } catch (error) {
    const protocolLike = error as { code?: unknown; message?: string; details?: unknown };
    if (protocolLike?.code === "INVALID_INPUT") {
      throw error;
    }

    throw protocolError(
      "EXECUTION_FAILED",
      `generation failed: ${protocolLike?.message ?? String(error)}`,
      {
        stage: "generation_failure",
        details: protocolLike?.details,
      },
    );
  }

  const changedFiles = dedupe(artifacts.flatMap((artifact) => artifact.changedFiles)).sort();
  const staged = await stageAndValidateBuildArtifacts(repoDir, artifacts, runtime);
  const packages = staged.packages;
  let targetRuntime: RuntimeVerificationSummary | undefined;

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
          `target validation failed for ${builtPackage.packageName}: ${finalValidation.violatedRules[0]?.message ?? "unknown validation error"}`,
          {
            stage: "validation_failure",
            packageName: builtPackage.packageName,
            violatedRules: finalValidation.violatedRules,
          },
        );
      }
    }

    targetRuntime = await runRuntimeSmokeVerification(packages.map((pkg) => pkg.packageDir), "target");
  }

  const status: BuildCertifiedExtensionOutput["status"] = applyChanges ? "runtime_verified" : "source_validated";

  return {
    status,
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
    verification: {
      sdkDistribution: GENERATED_SDK_DISTRIBUTION,
      sdkSourceOfTruth: GENERATED_SDK_FILE,
      stages: {
        sourceGenerated: true,
        sourceValidated: true,
        dependenciesResolved: true,
        packageInstallable: true,
        packageLoadable: true,
        nodeRegistered: true,
        publicProvideInvokable: true,
        targetFilesApplied: applyChanges,
        targetRuntimeVerified: applyChanges,
      },
      stagedRuntime: staged.stagedRuntime,
      targetRuntime,
    },
    assumptions: dedupe(assumptions).slice(0, 8),
    summary: applyChanges
      ? `Built ${packages.length} package${packages.length === 1 ? "" : "s"}, applied ${changedFiles.length} file change${changedFiles.length === 1 ? "" : "s"}, and verified load, registration, and invocation in the target path.`
      : `Dry-run complete: generated ${packages.length} package${packages.length === 1 ? "" : "s"}, passed source validation, and passed staged runtime smoke verification without writing target files.`,
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

function normalizeBuildCertifiedExtensionDescription(input: BuildCertifiedExtensionInput): string {
  const value = input.description?.trim() || input.brief?.trim();
  return normalizeWhitespace(value ?? "");
}

function isNextSessionSettingsManagerBrief(description: string): boolean {
  const lowerDescription = description.toLowerCase();
  const hasNextSessionBoundary = mentionsAny(lowerDescription, [
    "next session",
    "next-session",
    "next startup",
    "next reload",
    "manual /reload",
    "manual reload",
    "next session startup",
  ]);
  const hasSettingsManagerShape =
    mentionsAny(lowerDescription, [
      "settings.json",
      ".pi/settings",
      "project or global settings",
      "packages entries",
      "settings packages entries",
      "configure_package_loading",
      "answer_loading_question",
    ]) &&
    mentionsAny(lowerDescription, ["typed", "public provide", "public provides", "project", "global", "settings"]);

  return hasNextSessionBoundary && hasSettingsManagerShape;
}

export function findUnsupportedCertifiedBuilderReasons(description: string): string[] {
  const lowerDescription = description.toLowerCase();
  const reasons: string[] = [];
  const nextSessionSettingsManager = isNextSessionSettingsManagerBrief(lowerDescription);

  if (mentionsAny(lowerDescription, ["tui", "text ui", "menu", "overlay", "picker", "multi-select", "multiselect", "checkbox"])) {
    reasons.push("interactive TUI/menu behavior");
  }

  if (
    !nextSessionSettingsManager &&
    mentionsAny(lowerDescription, ["preload", "pre-load", "pre pi", "pre-pi", "before pi", "before loading", "startup config"]) &&
    mentionsAny(lowerDescription, ["extension", "extensions", "package", "packages", "load", "loading"])
  ) {
    reasons.push("pre-start extension/package loading configuration");
  }

  if (
    !nextSessionSettingsManager &&
    mentionsAny(lowerDescription, [
      "choose what extensions",
      "which extensions to load",
      "extension loader",
      "extension paths",
      "additional extension paths",
      "resource discovery",
      "resources_discover",
    ])
  ) {
    reasons.push("current-session extension loading/discovery interception");
  }

  if (
    !nextSessionSettingsManager &&
    mentionsAny(lowerDescription, [
      "outside normal extension/package discovery",
      "outside pi's normal discovery",
      "better at discovering",
      "discover tools not within pi's normal extension/package discovery",
    ]) &&
    mentionsAny(lowerDescription, ["load", "loading", "extensions", "extension"])
  ) {
    reasons.push("custom extension/tool discovery outside normal Pi discovery");
  }

  return dedupe(reasons);
}

function validateBuildCertifiedExtensionInput(input: BuildCertifiedExtensionInput): void {
  if (!input || typeof input !== "object") {
    throw protocolError("INVALID_INPUT", "build input requires an object");
  }

  if (!normalizeBuildCertifiedExtensionDescription(input)) {
    throw protocolError("INVALID_INPUT", "description or brief is required");
  }

  if (input.repoDir !== undefined && !input.repoDir.trim()) {
    throw protocolError("INVALID_INPUT", "repoDir must be a non-empty string when provided");
  }

  if (input.replaceExisting !== undefined && typeof input.replaceExisting !== "boolean") {
    throw protocolError("INVALID_INPUT", "replaceExisting must be boolean when provided");
  }

  if (input.applyChanges !== undefined && typeof input.applyChanges !== "boolean") {
    throw protocolError("INVALID_INPUT", "applyChanges must be boolean when provided");
  }

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

async function stageAndValidateBuildArtifacts(
  repoDir: string,
  artifacts: BuildArtifact[],
  runtime: InternalBuilderRuntime,
): Promise<{ packages: BuiltCertifiedPackageSummary[]; stagedRuntime: RuntimeVerificationSummary }> {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-certified-build-"));

  try {
    const results: BuiltCertifiedPackageSummary[] = [];
    const stagedPackageDirs: string[] = [];

    for (const artifact of artifacts) {
      const stagedPackageDir = artifact.relativeDir === "." ? stagingRoot : path.join(stagingRoot, artifact.relativeDir);
      await writeGeneratedFiles(stagedPackageDir, artifact.files);

      const validation = await runtime.invokeInternal<ValidateCertifiedNodeOutput>("validate_extension", {
        packageDir: stagedPackageDir,
      });

      if (!validation.pass) {
        throw protocolError(
          "EXECUTION_FAILED",
          `source validation failed for ${artifact.packageName}: ${validation.violatedRules[0]?.message ?? "unknown validation error"}`,
          {
            stage: "validation_failure",
            packageName: artifact.packageName,
            violatedRules: validation.violatedRules,
          },
        );
      }

      stagedPackageDirs.push(stagedPackageDir);
      results.push({
        packageName: artifact.packageName,
        nodeId: artifact.nodeId,
        packageDir: artifact.relativeDir === "." ? repoDir : path.join(repoDir, artifact.relativeDir),
        changedFiles: artifact.changedFiles,
        provides: artifact.provides,
      });
    }

    const stagedRuntime = await runRuntimeSmokeVerification(stagedPackageDirs, "staging");
    return { packages: results, stagedRuntime };
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function buildCertifiedExtension(
  input: BuildCertifiedExtensionInput,
): Promise<BuildCertifiedExtensionOutput> {
  return buildCertifiedExtensionWithRuntime(input, createDirectInternalBuilderRuntime());
}

