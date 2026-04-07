import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  FABRIC_KEY,
  type ProtocolInvokeRequest,
  type ProtocolInvokeResult,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";
import activate from "../extensions/index.ts";
import type {
  DescribeCertifiedTemplateOutput,
  ScaffoldCertifiedNodeOutput,
  ScaffoldCollaboratingNodesOutput,
  ValidateCertifiedNodeOutput,
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

type EventHandler = (payload?: unknown, ctx?: CommandContext) => Promise<void> | void;

type DemoPiRuntime = ProtocolSessionPi &
  ExtensionAPI & {
    entries: Array<{ kind: string; data: unknown }>;
    commands: Map<string, RegisteredCommand>;
    notifications: Notification[];
    on: (event: string, handler: EventHandler) => void;
    emit: (event: string, payload?: unknown) => Promise<void>;
    registerCommand: (name: string, options: RegisteredCommand) => void;
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

  return {
    entries,
    commands,
    notifications,
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

async function writeScaffold(rootDir: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }
}

async function invokeTyped<TOutput>(
  fabric: { invoke: (request: ProtocolInvokeRequest) => Promise<ProtocolInvokeResult> },
  request: ProtocolInvokeRequest,
): Promise<ProtocolInvokeResult<TOutput>> {
  return (await fabric.invoke(request)) as ProtocolInvokeResult<TOutput>;
}

async function main(): Promise<void> {
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];

  const runtime = createPiRuntime();
  const fabric = activate(runtime);
  await runtime.emit("session_start", { reason: "demo" });

  printSection("registry", fabric.getRegistry());

  const selfValidate = await invokeTyped<ValidateCertifiedNodeOutput>(fabric, {
    callerNodeId: "demo-runner",
    provide: "validate_certified_node",
    target: { nodeId: "pi-pi" },
    input: { packageDir: "." },
  });
  printSection("validate_pi_pi", selfValidate);

  const describe = await invokeTyped<DescribeCertifiedTemplateOutput>(fabric, {
    callerNodeId: "demo-runner",
    provide: "describe_certified_template",
    target: { nodeId: "pi-pi" },
    input: { includeCommandExamples: true },
  });
  printSection("describe_certified_template", describe);

  const scaffold = await invokeTyped<ScaffoldCertifiedNodeOutput>(fabric, {
    callerNodeId: "demo-runner",
    provide: "scaffold_certified_node",
    target: { nodeId: "pi-pi" },
    input: {
      packageName: "pi-hello",
      nodeId: "pi-hello",
      purpose: "Greets users through a certified protocol package.",
      provides: [
        {
          name: "say_hello",
          description: "Return a starter greeting response.",
        },
      ],
      useInlineSchemas: false,
      generateDebugCommands: true,
    },
  });
  printSection("scaffold_certified_node", scaffold);

  if (scaffold.ok === false) {
    throw new Error(scaffold.error.message);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-demo-"));
  await writeScaffold(tmpDir, scaffold.output.files);

  const validate = await invokeTyped<ValidateCertifiedNodeOutput>(fabric, {
    callerNodeId: "demo-runner",
    provide: "validate_certified_node",
    target: { nodeId: "pi-pi" },
    input: { packageDir: tmpDir },
  });
  printSection("validate_certified_node", validate);

  const pair = await invokeTyped<ScaffoldCollaboratingNodesOutput>(fabric, {
    callerNodeId: "demo-runner",
    provide: "scaffold_collaborating_nodes",
    target: { nodeId: "pi-pi" },
    input: {
      managerPackageName: "pi-manager",
      managerNodeId: "pi-manager",
      workerPackageName: "pi-worker",
      workerNodeId: "pi-worker",
      managerProvideName: "delegate_task",
      workerProvideName: "do_task",
      workerMode: "agent-backed",
      generateInternalPromptFiles: true,
      generateDebugCommands: true,
    },
  });
  printSection("scaffold_collaborating_nodes", pair);

  if (pair.ok === false) {
    throw new Error(pair.error.message);
  }

  const pairRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-pair-"));
  const managerDir = path.join(pairRootDir, pair.output.manager.packageName);
  const workerDir = path.join(pairRootDir, pair.output.worker.packageName);
  await writeScaffold(managerDir, pair.output.manager.files);
  await writeScaffold(workerDir, pair.output.worker.files);

  const validateManager = await invokeTyped<ValidateCertifiedNodeOutput>(fabric, {
    callerNodeId: "demo-runner",
    provide: "validate_certified_node",
    target: { nodeId: "pi-pi" },
    input: { packageDir: managerDir },
  });
  const validateWorker = await invokeTyped<ValidateCertifiedNodeOutput>(fabric, {
    callerNodeId: "demo-runner",
    provide: "validate_certified_node",
    target: { nodeId: "pi-pi" },
    input: { packageDir: workerDir },
  });
  printSection("validate_collaborating_pair", {
    manager: validateManager,
    worker: validateWorker,
    managerUsesFabricInvoke: pair.output.manager.files["protocol/handlers.ts"].includes("ctx.fabric.invoke"),
    workerHasInternalPrompt:
      "protocol/prompts/do_task.md" in pair.output.worker.files ||
      Object.keys(pair.output.worker.files).some((filePath) => filePath.startsWith("protocol/prompts/")),
  });

  await runtime.runCommand("pi-pi-template", JSON.stringify({ includeCommandExamples: true }));

  const commandTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-command-"));
  await runtime.runCommand(
    "pi-pi-new",
    JSON.stringify({
      destinationDir: commandTmpDir,
      input: {
        packageName: "pi-commanded",
        nodeId: "pi-commanded",
        purpose: "Scaffolded from the pi-pi command projection.",
        provides: [{ name: "ping", description: "Return a starter ping response." }],
        useInlineSchemas: false,
      },
    }),
  );
  await runtime.runCommand("pi-pi-validate", commandTmpDir);

  const pairCommandRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-command-pair-"));
  await runtime.runCommand(
    "pi-pi-new-pair",
    JSON.stringify({
      destinationDir: pairCommandRootDir,
      input: {
        managerPackageName: "pi-command-manager",
        managerNodeId: "pi-command-manager",
        workerPackageName: "pi-command-worker",
        workerNodeId: "pi-command-worker",
        managerProvideName: "delegate_task",
        workerProvideName: "do_task",
        workerMode: "deterministic",
      },
    }),
  );

  printSection(
    "command-notifications",
    runtime.notifications.map((item) => ({
      level: item.level,
      preview: item.message.slice(0, 160),
    })),
  );

  await runtime.emit("session_shutdown", { reason: "demo-finished" });
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
