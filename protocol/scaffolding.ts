import { promises as fs } from "node:fs";
import { describeGeneratedFile, renderJson } from "./core-shared.ts";
import { validateScaffoldInput, validateCollaboratingNodesInput } from "./validation.ts";
import {
  CERTIFICATION_CHECKLIST,
  createCollaboratingPackageFiles,
  createManagerProvideSchemas,
  createWorkerProvideSchemas,
  renderCollaboratingReadme,
  renderExtensionFile,
  renderHandlersFile,
  renderReadme,
  renderManagerHandlersFile,
  renderWorkerHandlersFile,
  renderWorkerInternalPrompt,
} from "./template-renderer.ts";
import { createStarterSchemas } from "./provide-blueprints.ts";
import {
  GENERATED_SDK_DISTRIBUTION,
  GENERATED_SDK_FILE,
  NODE_TYPES_VERSION,
  PI_CODING_AGENT_VERSION,
  PROTOCOL_VERSION,
  TYPESCRIPT_VERSION,
  VALIDATION_MODE,
  VENDORED_SDK_SOURCE_PATH,
} from "./constants.ts";
import type {
  ScaffoldCertifiedNodeInput,
  ScaffoldCertifiedNodeOutput,
  ScaffoldCollaboratingNodesInput,
  ScaffoldCollaboratingNodesOutput,
} from "./contracts.ts";
import type { PiProtocolManifest } from "../vendor/pi-protocol-sdk.ts";

async function readVendoredSdkSource(): Promise<string> {
  return fs.readFile(VENDORED_SDK_SOURCE_PATH, "utf8");
}

export async function scaffoldCertifiedNode(
  input: ScaffoldCertifiedNodeInput,
): Promise<ScaffoldCertifiedNodeOutput> {
  validateScaffoldInput(input);

  const packageVersion = input.packageVersion?.trim() || "0.1.0";
  const vendoredSdkSource = await readVendoredSdkSource();
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
    [GENERATED_SDK_FILE]: vendoredSdkSource,
    "protocol/handlers.ts": renderHandlersFile(input.nodeId, input.provides),
    "README.md": renderReadme(input, useInlineSchemas, generateDebugCommands, strictTypes),
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
    sdkDistribution: GENERATED_SDK_DISTRIBUTION,
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
      "This function returns generated files without writing them to disk.",
      "Generated bootstrap ensures the shared fabric and the standard protocol projection by default.",
      `The generated package vendors ${GENERATED_SDK_FILE} from pi-pi as its SDK source of truth.`,
      "Run validation and runtime smoke verification before claiming the package is live in Pi.",
    ],
  };
}

export async function scaffoldCollaboratingNodes(
  input: ScaffoldCollaboratingNodesInput,
): Promise<ScaffoldCollaboratingNodesOutput> {
  validateCollaboratingNodesInput(input);

  const packageVersion = input.packageVersion?.trim() || "0.1.0";
  const vendoredSdkSource = await readVendoredSdkSource();
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
    vendoredSdkSource,
    strictTypes,
    generateDebugCommands,
    manifest: managerManifest,
    handlersFile: renderManagerHandlersFile(input),
    readme: renderCollaboratingReadme({
      packageName: input.managerPackageName,
      nodeId: input.managerNodeId,
      purpose: managerManifest.purpose,
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
    vendoredSdkSource,
    strictTypes,
    generateDebugCommands,
    manifest: workerManifest,
    handlersFile: renderWorkerHandlersFile(input, generateInternalPromptFiles),
    readme: renderCollaboratingReadme({
      packageName: input.workerPackageName,
      nodeId: input.workerNodeId,
      purpose: workerManifest.purpose,
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
    sdkDistribution: GENERATED_SDK_DISTRIBUTION,
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
