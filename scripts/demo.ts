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
import type { BuildCertifiedExtensionOutput } from "../protocol/core.ts";

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

  const registry = fabric.getRegistry();
  printSection("registry", {
    ...registry,
    nodes: registry.nodes
      .map((node) => ({
        ...node,
        provides: node.provides.filter((provide) => provide.visibility === "public"),
      }))
      .filter((node) => node.provides.length > 0),
    provides: registry.provides.filter((provide) => provide.visibility === "public"),
  });
  printSection("activation_assertions", {
    protocolToolRegistered: runtime.getAllTools().some((tool) => tool.name === "protocol"),
  });

  const freshRepo = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-demo-builder-"));
  const build = await invokeTyped<BuildCertifiedExtensionOutput>(fabric, {
    callerNodeId: "demo-runner",
    provide: "build_certified_extension",
    target: { nodeId: "pi-pi" },
    input: {
      description: "Build me a certified extension that summarizes markdown notes in the workspace and also gives me a local command.",
      repoDir: freshRepo,
      applyChanges: true,
    },
    handoff: { opaque: true },
  });
  printSection("build_certified_extension", build);

  await runtime.runCommand(
    "pi-pi-build-certified-extension",
    JSON.stringify({
      description: "Build me a certified extension that validates a repository.",
      repoDir: await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-command-builder-")),
      applyChanges: true,
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
