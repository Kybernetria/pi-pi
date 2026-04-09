import { promises as fs } from "node:fs";
import type { PiProtocolManifest } from "../vendor/pi-protocol-sdk.ts";
import {
  GENERATED_SDK_DISTRIBUTION,
  GENERATED_SDK_FILE,
  NODE_TYPES_VERSION,
  PI_CODING_AGENT_VERSION,
  PROTOCOL_VERSION,
  TYPESCRIPT_VERSION,
} from "./constants.ts";
import { commandBase, describeGeneratedFile, renderJson, toPascalCase } from "./core-shared.ts";
import { createStarterSchemas, inferProvideBlueprint } from "./provide-blueprints.ts";
import type {
  CollaboratingWorkerMode,
  ScaffoldCertifiedNodeInput,
  ScaffoldCollaboratingNodesInput,
  ScaffoldProvideInput,
} from "./contracts.ts";
import type { JSONSchemaLite } from "../vendor/pi-protocol-sdk.ts";

export const CERTIFICATION_CHECKLIST = [
  "package.json#pi declares the package as a Pi package",
  "pi.protocol.json exists and matches the package handlers",
  "vendor/pi-protocol-sdk.ts exists and is the only SDK shim the package needs",
  "extensions/index.ts ensures the shared fabric and standard protocol projection during activation",
  "session_start registers the node with the shared fabric",
  "session_shutdown unregisters the node",
  "every public provide has input and output schemas",
  "cross-node calls use protocol-native delegation surfaces",
  "the package avoids forbidden direct sibling certified-node imports",
  "the package passes source validation before runtime verification",
  "runtime smoke verification confirms load, registration, and invocation",
];

export const REQUIRED_FILES = [
  "package.json",
  "pi.protocol.json",
  GENERATED_SDK_FILE,
  "extensions/index.ts",
  "protocol/handlers.ts",
];

export const RECOMMENDED_FILES = ["README.md", "tsconfig.json"];

export function createManagerProvideSchemas(
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

export function createWorkerProvideSchemas(
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

export function createCollaboratingPackageFiles(options: {
  packageName: string;
  nodeId: string;
  packageVersion: string;
  vendoredSdkSource: string;
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
    [GENERATED_SDK_FILE]: options.vendoredSdkSource,
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

export function renderExtensionFile(options: {
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
} from "../vendor/pi-protocol-sdk.ts";
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

export function renderProvideHandlerBlock(_nodeId: string, provide: ScaffoldProvideInput): string {
  return inferProvideBlueprint(provide).handlerStub(provide);
}

export function renderHandlersFile(nodeId: string, provides: ScaffoldProvideInput[]): string {
  const blocks = provides.map((provide) => renderProvideHandlerBlock(nodeId, provide)).join("\n\n");

  return `import type { ProtocolHandler } from "../vendor/pi-protocol-sdk.ts";

// ${nodeId} starter handlers
// Each handler keeps the public protocol contract typed, even when the implementation is still a TODO.
${blocks}
`;
}

export function renderManagerHandlersFile(input: ScaffoldCollaboratingNodesInput): string {
  const managerInterface = toPascalCase(input.managerProvideName);
  const workerInterface = toPascalCase(input.workerProvideName);

  return `import type { ProtocolHandler } from "../vendor/pi-protocol-sdk.ts";

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

export function renderWorkerHandlersFile(
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
import type { ProtocolHandler } from "../vendor/pi-protocol-sdk.ts";

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

  return `import type { ProtocolHandler } from "../vendor/pi-protocol-sdk.ts";

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

export function renderCollaboratingReadme(options: {
  packageName: string;
  nodeId: string;
  purpose: string;
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
- SDK distribution: ${GENERATED_SDK_DISTRIBUTION} via ${GENERATED_SDK_FILE}

## Notes

${options.notes.map((note) => `- ${note}`).join("\n")}
- Standard protocol projection bootstrap is batteries-included via ` + "`ensureProtocolAgentProjection(...)`" + `.
- Pi commands, tools, and other UI surfaces remain projections over the protocol rather than the protocol itself.
${options.collaborationRole === "worker" && options.workerMode === "agent-backed"
  ? "- Internal prompts stay under `protocol/prompts/` and remain non-public by default.\n"
  : ""}## Install and load in Pi

1. ` + "`npm install`" + ` in this package directory.
2. Add the package to Pi with ` + "`pi install /absolute/path/to/package`" + ` or ` + "`pi install ./relative/path/to/package`" + `.
3. Restart Pi or run ` + "`/reload`" + `.
4. Confirm the node appears in the protocol registry and invoke a public provide.

## Local checklist

${CERTIFICATION_CHECKLIST.map((item) => `- [ ] ${item}`).join("\n")}
`;
}

export function renderWorkerInternalPrompt(input: ScaffoldCollaboratingNodesInput): string {
  return `# Internal prompt for ${input.workerNodeId}.${input.workerProvideName}

You are implementing the internal reasoning pattern for ${input.workerNodeId}.${input.workerProvideName}.

Rules:
- Return structured output that still matches the provide schema.
- Do not expose this prompt as a Pi skill.
- Treat the protocol contract as canonical.
- If nested protocol calls are needed, use the bound protocol delegation surface provided by the runtime.
`;
}

export function renderReadme(
  input: ScaffoldCertifiedNodeInput,
  useInlineSchemas: boolean,
  generateDebugCommands: boolean,
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
- SDK distribution: ${GENERATED_SDK_DISTRIBUTION} via ${GENERATED_SDK_FILE}

## Provides

${input.provides.map((provide) => `- ${provide.name}: ${provide.description}`).join("\n")}

## Notes

- The public protocol contract is the manifest plus your public provides.
- Generated bootstrap ensures the shared fabric and the standard protocol projection by default.
- The package vendors its SDK shim at ` + "`vendor/pi-protocol-sdk.ts`" + ` so it does not depend on an unpublished package.
- Pi commands, tools, and other UI surfaces remain projections over the protocol rather than the protocol itself.
- If nested protocol calls are introduced later, prefer the bound ` + "`ctx.delegate.invoke(...)`" + ` surface.
- Source validation is AST-assisted and source-based; live runtime claims should come from runtime smoke verification.

## Install and load in Pi

1. ` + "`npm install`" + ` in this package directory.
2. Add the package to Pi with ` + "`pi install /absolute/path/to/package`" + ` or ` + "`pi install ./relative/path/to/package`" + `.
3. Restart Pi or run ` + "`/reload`" + `.
4. Confirm the node appears in the protocol registry and invoke a public provide.

## Local checklist

${CERTIFICATION_CHECKLIST.map((item) => `- [ ] ${item}`).join("\n")}
`;
}

export async function readVendoredSdkSource(sourcePath: string): Promise<string> {
  return fs.readFile(sourcePath, "utf8");
}

export function describeGeneratedFilePlan(filePaths: string[]) {
  return filePaths
    .sort()
    .map((filePath) => ({
      path: filePath,
      purpose: describeGeneratedFile(filePath),
    }));
}

export { createStarterSchemas };
