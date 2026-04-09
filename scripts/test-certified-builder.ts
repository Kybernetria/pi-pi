import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverAndLoadExtensions } from "@mariozechner/pi-coding-agent";
import activate from "../extensions/index.ts";
import {
  FABRIC_KEY,
  PROTOCOL_AGENT_PROJECTION_KEY,
  PROTOCOL_PROMPT_AWARENESS_KEY,
  PROTOCOL_SUBAGENT_STATUS_RENDERER_KEY,
  PROTOCOL_SUBAGENT_STREAM_RENDERER_KEY,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";

interface RegisteredTool {
  name: string;
  execute?: (toolCallId: string, input: unknown) => Promise<{ details?: { result?: unknown } }>;
}

interface RegisteredCommand {
  description: string;
  handler: (args: string, ctx: { ui: { notify: (message: string, level?: "info" | "error") => void } }) => Promise<void> | void;
}

interface Notification {
  level: string;
  message: string;
}

interface CustomMessage {
  customType: string;
  content: string;
  display?: boolean;
  details?: unknown;
}

type EventHandler = (payload?: unknown) => Promise<unknown> | unknown;

interface TestPiRuntime extends ProtocolSessionPi {
  on: (event: string, handler: EventHandler) => void;
  emit: (event: string, payload?: unknown) => Promise<void>;
  registerTool: (tool: RegisteredTool) => void;
  registerCommand: (name: string, command: RegisteredCommand) => void;
  registerMessageRenderer: (customType: string, renderer: unknown) => void;
  sendMessage: (message: unknown, options?: unknown) => void;
  getAllTools: () => RegisteredTool[];
  runCommand: (name: string, args?: string) => Promise<void>;
  getNotifications: () => Notification[];
  getMessages: () => CustomMessage[];
  getMessageRendererTypes: () => string[];
}

function resetProtocolGlobals(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_AGENT_PROJECTION_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_PROMPT_AWARENESS_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_SUBAGENT_STATUS_RENDERER_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_SUBAGENT_STREAM_RENDERER_KEY];
}

function createPiRuntime(): TestPiRuntime {
  const listeners = new Map<string, EventHandler[]>();
  const tools: RegisteredTool[] = [];
  const commands = new Map<string, RegisteredCommand>();
  const notifications: Notification[] = [];
  const messages: CustomMessage[] = [];
  const messageRendererTypes: string[] = [];

  return {
    appendEntry() {
      // no-op
    },
    on(event: string, handler: EventHandler) {
      const current = listeners.get(event) ?? [];
      current.push(handler);
      listeners.set(event, current);
    },
    async emit(event: string, payload: unknown = {}) {
      for (const handler of listeners.get(event) ?? []) {
        await handler(payload);
      }
    },
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    registerMessageRenderer(customType: string) {
      messageRendererTypes.push(customType);
    },
    sendMessage(message: unknown) {
      messages.push(message as CustomMessage);
    },
    getAllTools() {
      return [...tools];
    },
    async runCommand(name: string, args = "") {
      const command = commands.get(name);
      assert.ok(command, `command ${name} should be registered`);
      await command?.handler(args, {
        ui: {
          notify(message: string, level = "info") {
            notifications.push({ level, message });
          },
        },
      });
    },
    getNotifications() {
      return [...notifications];
    },
    getMessages() {
      return [...messages];
    },
    getMessageRendererTypes() {
      return [...messageRendererTypes];
    },
  } as TestPiRuntime;
}

async function invokeProtocolTool(runtime: TestPiRuntime, input: unknown): Promise<unknown> {
  const tool = runtime.getAllTools().find((entry) => entry.name === "protocol");
  assert.ok(tool?.execute, "protocol tool should be registered");
  const result = await tool?.execute?.("tool-call", input);
  return result?.details?.result;
}

async function startRuntime(): Promise<TestPiRuntime> {
  const runtime = createPiRuntime();
  activate(runtime as unknown as Parameters<typeof activate>[0]);
  await runtime.emit("session_start", { reason: "fresh-session" });
  return runtime;
}

async function loadGeneratedPackageThroughPiDiscovery(packageDir: string): Promise<void> {
  const loaded = await discoverAndLoadExtensions([packageDir], packageDir);
  assert.equal(loaded.errors.length, 0, "generated package should load through pi extension discovery");

  loaded.runtime.getAllTools = () => [];
  loaded.runtime.getActiveTools = () => [];
  loaded.runtime.appendEntry = () => {};
  loaded.runtime.getCommands = () => [];

  for (const extension of loaded.extensions) {
    for (const handler of extension.handlers.get("session_start") ?? []) {
      await handler({ reason: "pi-discovery-test" });
    }
  }
}

async function main(): Promise<void> {
  resetProtocolGlobals();

  const runtimeA = await startRuntime();
  assert.ok(runtimeA.getMessageRendererTypes().includes("chat-pi-pi-result"));
  const nodeResult = (await invokeProtocolTool(runtimeA, {
    action: "describe_node",
    nodeId: "pi-pi",
  })) as { ok: boolean; action: string; node?: { provides?: Array<{ name: string }> } };

  assert.equal(nodeResult.ok, true);
  assert.deepEqual(
    nodeResult.node?.provides?.map((provide) => provide.name),
    ["chat_pi_pi"],
    "fresh-session public surface should expose only the chat contract",
  );

  const freshRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-fresh-builder-"));
  await writeFile(path.join(freshRepo, "LICENSE"), "MIT\n", "utf8");
  const freshBuild = (await invokeProtocolTool(runtimeA, {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        message: "Build me a certified extension that summarizes markdown notes and offers a local command.",
        repoDir: freshRepo,
        applyChanges: true,
      },
      handoff: { opaque: true },
    },
  })) as {
    ok: boolean;
    action: string;
    result?: {
      ok: boolean;
      output?: {
        status: string;
        reply: string;
        build?: {
          status: string;
          packages: Array<{ packageDir: string; provides: string[] }>;
          verification: {
            stages: { targetRuntimeVerified: boolean; targetFilesApplied: boolean };
            stagedRuntime: { invokedProvides: string[] };
          };
          summary: string;
        };
      };
    };
  };

  assert.equal(freshBuild.ok, true);
  assert.equal(freshBuild.result?.ok, true);
  assert.equal(freshBuild.result?.output?.status, "completed");
  assert.equal(freshBuild.result?.output?.build?.status, "runtime_verified");
  assert.equal(freshBuild.result?.output?.build?.packages.length, 1);
  assert.ok(
    freshBuild.result?.output?.reply.includes("verified") ||
      freshBuild.result?.output?.build?.summary.includes("verified load, registration, and invocation"),
  );
  assert.equal(freshBuild.result?.output?.build?.verification.stages.targetFilesApplied, true);
  assert.equal(freshBuild.result?.output?.build?.verification.stages.targetRuntimeVerified, true);
  assert.ok(freshBuild.result?.output?.build?.verification.stagedRuntime.invokedProvides.length >= 1);
  assert.ok(
    freshBuild.result?.output?.build?.packages[0]?.provides.includes("summarize_content") ||
      freshBuild.result?.output?.build?.packages[0]?.provides.includes("summarize_notes"),
    "fresh repo with only harmless root files should stay on the greenfield builder path",
  );
  const freshPackageJson = JSON.parse(await readFile(path.join(freshRepo, "package.json"), "utf8"));
  assert.ok(!JSON.stringify(freshPackageJson).includes("@kyvernitria/pi-protocol-sdk"));
  assert.ok((await readFile(path.join(freshRepo, "vendor", "pi-protocol-sdk.ts"), "utf8")).includes("FABRIC_KEY"));

  await loadGeneratedPackageThroughPiDiscovery(freshRepo);
  const generatedManifest = JSON.parse(await readFile(path.join(freshRepo, "pi.protocol.json"), "utf8")) as {
    nodeId: string;
    provides: Array<{ name: string }>;
  };
  const discoveredProvide = generatedManifest.provides[0]?.name;
  const sharedFabric = (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY] as {
    describe?: (nodeId?: string) => unknown;
    invoke?: (input: unknown) => Promise<{ ok: boolean }>;
  };
  assert.ok(sharedFabric?.describe?.(generatedManifest.nodeId), "generated package should register after Pi-style extension discovery");
  const discoveredInvocation = await sharedFabric.invoke?.({
    callerNodeId: "pi-pi-test",
    provide: discoveredProvide,
    target: { nodeId: generatedManifest.nodeId },
    input: { text: "hello from discovery test" },
  });
  assert.equal(discoveredInvocation?.ok, true, "generated package public provide should invoke after Pi-style discovery");

  const commandRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-command-builder-"));
  await writeFile(path.join(commandRepo, "LICENSE"), "MIT\n", "utf8");
  const previousCwd = process.cwd();
  process.chdir(commandRepo);
  try {
    await runtimeA.runCommand(
      "chat-pi-pi",
      "build me a certified extension that validates a repository and offers a local command",
    );
  } finally {
    process.chdir(previousCwd);
  }
  const commandResultMessage = runtimeA.getMessages().at(-1);
  assert.equal(commandResultMessage?.customType, "chat-pi-pi-result");
  assert.ok(commandResultMessage?.content.includes("Build status: runtime_verified"));
  assert.ok(commandResultMessage?.content.includes(`Repo: ${commandRepo}`));

  const helpCwd = await mkdtemp(path.join(os.tmpdir(), "pi-pi-help-cwd-"));
  await mkdir(path.join(helpCwd, "src"), { recursive: true });
  await writeFile(path.join(helpCwd, "src", "index.ts"), "export const brownfield = true;\n", "utf8");
  process.chdir(helpCwd);
  try {
    const helpResult = (await invokeProtocolTool(runtimeA, {
      action: "invoke",
      request: {
        provide: "chat_pi_pi",
        target: { nodeId: "pi-pi" },
        input: {
          message: "what do you do",
        },
      },
    })) as {
      ok: boolean;
      result?: { ok: boolean; output?: { status: string; reply: string; build?: unknown; questions?: string[] } };
    };

    assert.equal(helpResult.ok, true);
    assert.equal(helpResult.result?.ok, true);
    assert.equal(helpResult.result?.output?.status, "completed");
    assert.ok(
      helpResult.result?.output?.reply.includes("Pi Protocol packages") ||
        helpResult.result?.output?.reply.includes("certified package"),
    );
    assert.equal(helpResult.result?.output?.build, undefined);
    assert.equal(helpResult.result?.output?.questions, undefined);
  } finally {
    process.chdir(previousCwd);
  }

  const urlRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-url-builder-"));
  const urlBuild = (await invokeProtocolTool(runtimeA, {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        message: "Build a certified extension that summarizes the contents of a URL.",
        repoDir: urlRepo,
        applyChanges: true,
      },
      handoff: { opaque: true },
    },
  })) as {
    ok: boolean;
    result?: {
      ok: boolean;
      output?: { status: string; build?: { status: string; packages: Array<{ provides: string[] }> } };
    };
  };
  assert.equal(urlBuild.ok, true);
  assert.equal(urlBuild.result?.ok, true);
  assert.equal(urlBuild.result?.output?.status, "completed");
  assert.equal(urlBuild.result?.output?.build?.status, "runtime_verified");
  assert.ok(
    urlBuild.result?.output?.build?.packages[0]?.provides.includes("summarize_url"),
    "URL briefs should infer a URL-specific public provide",
  );

  const cwdRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-cwd-builder-"));
  await writeFile(path.join(cwdRepo, "LICENSE"), "MIT\n", "utf8");
  process.chdir(cwdRepo);
  try {
    const cwdBuild = (await invokeProtocolTool(runtimeA, {
      action: "invoke",
      request: {
        provide: "chat_pi_pi",
        target: { nodeId: "pi-pi" },
        input: {
          message: "Build me a certified extension that summarizes markdown notes and offers a local command.",
          applyChanges: true,
        },
      },
    })) as {
      ok: boolean;
      result?: {
        ok: boolean;
        output?: {
          status: string;
          build?: {
            repoDir: string;
            status: string;
          };
        };
      };
    };

    assert.equal(cwdBuild.ok, true);
    assert.equal(cwdBuild.result?.ok, true);
    assert.equal(cwdBuild.result?.output?.status, "completed");
    assert.equal(cwdBuild.result?.output?.build?.status, "runtime_verified");
    assert.equal(cwdBuild.result?.output?.build?.repoDir, cwdRepo);
  } finally {
    process.chdir(previousCwd);
  }

  await runtimeA.emit("session_shutdown", { reason: "done-a" });
  resetProtocolGlobals();

  const runtimeB = await startRuntime();
  const brownfieldRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-brownfield-builder-"));
  await mkdir(path.join(brownfieldRepo, "src"), { recursive: true });
  await writeFile(path.join(brownfieldRepo, "README.md"), "# brownfield\n", "utf8");
  await writeFile(path.join(brownfieldRepo, "src", "index.ts"), "export const legacy = true;\n", "utf8");

  const brownfieldClarification = (await invokeProtocolTool(runtimeB, {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        message: "Build me a certified extension that validates a repository.",
        repoDir: brownfieldRepo,
        applyChanges: true,
      },
    },
  })) as {
    ok: boolean;
    result?: { ok: boolean; output?: { status: string; reply: string; questions?: string[]; missingInformation?: string[] } };
  };
  assert.equal(brownfieldClarification.ok, true);
  assert.equal(brownfieldClarification.result?.ok, true);
  assert.equal(brownfieldClarification.result?.output?.status, "clarification_needed");
  assert.ok(
    brownfieldClarification.result?.output?.reply.includes("brownfield") ||
      brownfieldClarification.result?.output?.reply.includes("existing"),
  );
  assert.ok(
    brownfieldClarification.result?.output?.questions?.[0]?.includes(brownfieldRepo) ||
      brownfieldClarification.result?.output?.reply.includes(brownfieldRepo),
  );
  assert.ok(
    (brownfieldClarification.result?.output?.missingInformation ?? []).some((item) =>
      item.toLowerCase().includes("confirm") || item.toLowerCase().includes("replace"),
    ),
  );

  const brownfieldSuccess = (await invokeProtocolTool(runtimeB, {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        message: "Build me a certified extension that validates a repository.",
        repoDir: brownfieldRepo,
        replaceExisting: true,
        applyChanges: true,
      },
    },
  })) as {
    ok: boolean;
    result?: {
      ok: boolean;
      output?: { status: string; build?: { status: string; packages: Array<{ provides: string[] }> } };
    };
  };
  assert.equal(brownfieldSuccess.ok, true);
  assert.equal(brownfieldSuccess.result?.ok, true);
  assert.equal(brownfieldSuccess.result?.output?.status, "completed");
  assert.equal(brownfieldSuccess.result?.output?.build?.status, "runtime_verified");
  assert.ok(
    brownfieldSuccess.result?.output?.build?.packages[0]?.provides.includes("validate_repo"),
    "brownfield replacement should keep the user brief as the target contract instead of exposing migration scaffolding",
  );

  const pairRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-pair-builder-"));
  const pairSuccess = (await invokeProtocolTool(runtimeB, {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        message: "Build a manager/worker certified pair that delegates research tasks to a worker.",
        repoDir: pairRepo,
        applyChanges: true,
      },
      handoff: { opaque: true },
    },
  })) as {
    ok: boolean;
    result?: { ok: boolean; output?: { status: string; build?: { status: string; packages: Array<{ packageDir: string }> } } };
  };
  assert.equal(pairSuccess.ok, true);
  assert.equal(pairSuccess.result?.ok, true);
  assert.equal(pairSuccess.result?.output?.status, "completed");
  assert.equal(pairSuccess.result?.output?.build?.status, "runtime_verified");
  assert.equal(pairSuccess.result?.output?.build?.packages.length, 2);

  const unsupportedRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-unsupported-builder-"));
  await writeFile(path.join(unsupportedRepo, "LICENSE"), "MIT\n", "utf8");
  const unsupportedOutcome = (await invokeProtocolTool(runtimeB, {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        message:
          "Create an extension that helps choose what extensions you want to load with a small TUI menu acting like pre-Pi loading config and better discovery outside normal extension/package discovery.",
        repoDir: unsupportedRepo,
        applyChanges: true,
      },
    },
  })) as {
    ok: boolean;
    result?: { ok: boolean; output?: { status: string; reply: string; reasons?: string[] } };
  };
  assert.equal(unsupportedOutcome.ok, true);
  assert.equal(unsupportedOutcome.result?.ok, true);
  assert.equal(unsupportedOutcome.result?.output?.status, "unsupported");
  assert.ok(
    unsupportedOutcome.result?.output?.reply.includes("outside") ||
      unsupportedOutcome.result?.output?.reply.includes("not currently supported"),
  );
  assert.ok((unsupportedOutcome.result?.output?.reasons ?? []).some((reason) => reason.includes("TUI") || reason.includes("extension loading") || reason.includes("extension/tool discovery")));
  assert.deepEqual(
    (await readdir(unsupportedRepo)).sort(),
    ["LICENSE"],
    "unsupported non-protocol briefs should fail before writing generated package files",
  );

  const loadingConfigRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-loading-config-builder-"));
  await writeFile(path.join(loadingConfigRepo, "LICENSE"), "MIT\n", "utf8");
  const loadingConfigBuild = (await invokeProtocolTool(runtimeB, {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        message:
          "Build a Pi package named pi-ck that manages next-session Pi package loading configuration. It should scan configured roots, especially /var/home/kyvernitria/Applications/pi, and expose exactly two public provides: answer_loading_question and configure_package_loading. Any applied config only takes effect after manual /reload or next session startup.",
        repoDir: loadingConfigRepo,
        applyChanges: true,
      },
    },
  })) as {
    ok: boolean;
    result?: {
      ok: boolean;
      output?: { status: string; build?: { status: string; packages: Array<{ packageName: string; nodeId: string; provides: string[] }> } };
    };
  };
  assert.equal(loadingConfigBuild.ok, true);
  assert.equal(loadingConfigBuild.result?.ok, true);
  assert.equal(loadingConfigBuild.result?.output?.status, "completed");
  assert.equal(loadingConfigBuild.result?.output?.build?.status, "runtime_verified");
  assert.equal(loadingConfigBuild.result?.output?.build?.packages[0]?.packageName, "pi-ck");
  assert.equal(loadingConfigBuild.result?.output?.build?.packages[0]?.nodeId, "pi-ck");
  assert.deepEqual(
    loadingConfigBuild.result?.output?.build?.packages[0]?.provides,
    ["answer_loading_question", "configure_package_loading"],
    "next-session settings-manager briefs should stay in scope and preserve explicit public provide names",
  );

  console.log("builder runtime verification flow passed");
  await runtimeB.emit("session_shutdown", { reason: "done-b" });
  resetProtocolGlobals();
}

main().catch((error: unknown) => {
  console.error(error);
  resetProtocolGlobals();
  process.exitCode = 1;
});
