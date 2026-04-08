import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  FABRIC_KEY,
  type ProtocolInvokeRequest,
  type ProtocolInvokeResult,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";
import {
  scaffoldCollaboratingNodes,
  type ScaffoldCollaboratingNodesOutput,
  type ValidateCertifiedNodeOutput,
  validateCertifiedNode,
} from "../protocol/core.ts";

interface Notification {
  level: string;
  message: string;
}

interface CommandContext {
  ui: {
    notify: (message: string, level?: string) => void;
  };
}

interface RegisteredCommand {
  description: string;
  handler: (args: string, ctx: CommandContext) => Promise<void> | void;
}

interface RegisteredTool {
  name: string;
}

type EventHandler = (payload?: unknown, ctx?: CommandContext) => Promise<void> | void;

type DemoPiRuntime = ProtocolSessionPi &
  ExtensionAPI & {
    entries: Array<{ kind: string; data: unknown }>;
    commands: Map<string, RegisteredCommand>;
    notifications: Notification[];
    tools: RegisteredTool[];
    on: (event: string, handler: EventHandler) => void;
    emit: (event: string, payload?: unknown) => Promise<void>;
    registerCommand: (name: string, options: RegisteredCommand) => void;
    registerTool: (tool: RegisteredTool) => void;
    getAllTools: () => RegisteredTool[];
    runCommand: (name: string, args?: string) => Promise<void>;
  };

function createCommandContext(
  notifications: Notification[],
  entries: Array<{ kind: string; data: unknown }>,
): CommandContext {
  return {
    ui: {
      notify(message: string, level = "info") {
        notifications.push({ level, message });
        entries.push({ kind: "notification", data: { level, message } });
      },
    },
  };
}

function createPiRuntime(): DemoPiRuntime {
  const entries: Array<{ kind: string; data: unknown }> = [];
  const listeners = new Map<string, EventHandler[]>();
  const commands = new Map<string, RegisteredCommand>();
  const notifications: Notification[] = [];
  const tools: RegisteredTool[] = [];

  return {
    entries,
    commands,
    notifications,
    tools,
    appendEntry(kind: string, data: unknown) {
      entries.push({ kind, data });
    },
    on(event: string, handler: EventHandler) {
      const current = listeners.get(event) ?? [];
      current.push(handler);
      listeners.set(event, current);
    },
    async emit(event: string, payload: unknown = {}) {
      const ctx = createCommandContext(notifications, entries);
      for (const handler of listeners.get(event) ?? []) {
        await handler(payload, ctx);
      }
    },
    registerCommand(name: string, options: RegisteredCommand) {
      commands.set(name, options);
    },
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
    getAllTools() {
      return [...tools];
    },
    async runCommand(name: string, args = "") {
      const command = commands.get(name);
      if (!command) throw new Error(`Missing command ${name}`);
      await command.handler(args, createCommandContext(notifications, entries));
    },
  } as DemoPiRuntime;
}

function printSection(title: string, value: unknown): void {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(value, null, 2));
}

async function writeFiles(rootDir: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }
}

async function writeSdkPackage(rootDir: string): Promise<void> {
  const sdkDir = path.join(rootDir, "node_modules", "@kyvernitria", "pi-protocol-sdk");
  const vendorSdkPath = path.resolve("vendor/pi-protocol-sdk.ts");
  const piAiDir = path.join(rootDir, "node_modules", "@mariozechner", "pi-ai");

  await fs.mkdir(sdkDir, { recursive: true });
  await fs.writeFile(
    path.join(sdkDir, "package.json"),
    JSON.stringify(
      {
        name: "@kyvernitria/pi-protocol-sdk",
        version: "0.1.0-demo",
        type: "module",
        exports: "./index.ts",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await fs.copyFile(vendorSdkPath, path.join(sdkDir, "index.ts"));

  await fs.mkdir(piAiDir, { recursive: true });
  await fs.writeFile(
    path.join(piAiDir, "package.json"),
    JSON.stringify(
      {
        name: "@mariozechner/pi-ai",
        version: "0.0.0-demo",
        type: "module",
        exports: "./index.js",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(piAiDir, "index.js"),
    `const optional = (schema) => ({ ...schema, optional: true });

export const Type = {
  Object(properties = {}) {
    return { type: "object", properties };
  },
  Union(anyOf = []) {
    return { anyOf };
  },
  Literal(constValue) {
    return { const: constValue, type: typeof constValue };
  },
  Optional(schema) {
    return optional(schema);
  },
  Array(items) {
    return { type: "array", items };
  },
  String() {
    return { type: "string" };
  },
  Number() {
    return { type: "number" };
  },
  Boolean() {
    return { type: "boolean" };
  },
  Null() {
    return { type: "null" };
  },
  Any() {
    return {};
  },
};
`,
    "utf8",
  );
}

async function invokeTyped<TOutput>(
  fabric: { invoke: (request: ProtocolInvokeRequest) => Promise<ProtocolInvokeResult> },
  request: ProtocolInvokeRequest,
): Promise<ProtocolInvokeResult<TOutput>> {
  return (await fabric.invoke(request)) as ProtocolInvokeResult<TOutput>;
}

async function loadExtension<TActivate>(extensionPath: string): Promise<TActivate> {
  const moduleUrl = pathToFileURL(extensionPath).href;
  const imported = await import(moduleUrl);
  return imported.default as TActivate;
}

async function main(): Promise<void> {
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];

  const pair = (await scaffoldCollaboratingNodes({
    managerPackageName: "pi-runtime-manager",
    managerNodeId: "pi-runtime-manager",
    workerPackageName: "pi-runtime-worker",
    workerNodeId: "pi-runtime-worker",
    managerProvideName: "delegate_task",
    workerProvideName: "do_task",
    workerMode: "agent-backed",
    generateInternalPromptFiles: true,
    generateDebugCommands: false,
  })) as ScaffoldCollaboratingNodesOutput;

  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-runtime-pair-"));
  const managerDir = path.join(rootDir, pair.manager.packageName);
  const workerDir = path.join(rootDir, pair.worker.packageName);
  await writeFiles(managerDir, pair.manager.files);
  await writeFiles(workerDir, pair.worker.files);
  await writeSdkPackage(rootDir);

  const managerValidation = (await validateCertifiedNode({
    packageDir: managerDir,
  })) as ValidateCertifiedNodeOutput;
  const workerValidation = (await validateCertifiedNode({
    packageDir: workerDir,
  })) as ValidateCertifiedNodeOutput;
  printSection("pair_validation", {
    manager: managerValidation,
    worker: workerValidation,
  });

  const activateManager = await loadExtension<(pi: DemoPiRuntime) => unknown>(
    path.join(managerDir, "extensions", "index.ts"),
  );
  const activateWorker = await loadExtension<(pi: DemoPiRuntime) => unknown>(
    path.join(workerDir, "extensions", "index.ts"),
  );

  const runtime = createPiRuntime();
  const managerFabric = activateManager(runtime);
  const workerFabric = activateWorker(runtime);
  await runtime.emit("session_start", { reason: "demo-pair-runtime" });

  const fabric = managerFabric as { getRegistry: () => unknown; invoke: (request: ProtocolInvokeRequest) => Promise<ProtocolInvokeResult> };
  const registry = fabric.getRegistry();
  printSection("runtime_registry", registry);

  const invocation = await invokeTyped<{
    status: string;
    managerNodeId: string;
    workerNodeId: string;
    workerProvide: string;
    workerMode: string;
    workerResult: {
      status: string;
      workerNodeId: string;
      workerMode: string;
      result: string;
      promptUsed?: boolean;
      promptPath?: string;
    };
  }>(fabric, {
    callerNodeId: "demo-runner",
    provide: pair.crossNodeWiringSummary.managerProvide,
    target: { nodeId: pair.crossNodeWiringSummary.managerNodeId },
    input: {
      task: "summarize the demo milestone",
      note: "prove manager to worker delegation",
    },
  });
  printSection("runtime_invocation", invocation);

  printSection("runtime_assertions", {
    sameSharedFabric: managerFabric === workerFabric,
    protocolToolRegistered: runtime.getAllTools().some((tool) => tool.name === "protocol"),
    managerRegistered: JSON.stringify(registry).includes(pair.crossNodeWiringSummary.managerNodeId),
    workerRegistered: JSON.stringify(registry).includes(pair.crossNodeWiringSummary.workerNodeId),
    invocationOk: invocation.ok,
    workerReached:
      invocation.ok && invocation.output.workerNodeId === pair.crossNodeWiringSummary.workerNodeId,
    managerUsedDelegateInvoke: pair.manager.files["protocol/handlers.ts"].includes("ctx.delegate.invoke"),
    managerBootstrapEnsuresProjection: pair.manager.files["extensions/index.ts"].includes(
      "ensureProtocolAgentProjection",
    ),
    workerBootstrapEnsuresProjection: pair.worker.files["extensions/index.ts"].includes(
      "ensureProtocolAgentProjection",
    ),
    workerPromptWasUsed:
      invocation.ok && invocation.output.workerResult.promptUsed === true,
  });

  await runtime.emit("session_shutdown", { reason: "demo-pair-runtime-finished" });
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
