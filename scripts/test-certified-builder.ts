import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import activate from "../extensions/index.ts";
import {
  FABRIC_KEY,
  PROTOCOL_AGENT_PROJECTION_KEY,
  PROTOCOL_PROMPT_AWARENESS_KEY,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";

interface RegisteredTool {
  name: string;
  execute?: (toolCallId: string, input: unknown) => Promise<{ details?: { result?: unknown } }>;
}

type EventHandler = (payload?: unknown) => Promise<unknown> | unknown;

interface TestPiRuntime extends ProtocolSessionPi {
  on: (event: string, handler: EventHandler) => void;
  emit: (event: string, payload?: unknown) => Promise<void>;
  registerTool: (tool: RegisteredTool) => void;
  registerCommand?: (name: string, command: unknown) => void;
  getAllTools: () => RegisteredTool[];
}

function resetProtocolGlobals(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_AGENT_PROJECTION_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_PROMPT_AWARENESS_KEY];
}

function createPiRuntime(): TestPiRuntime {
  const listeners = new Map<string, EventHandler[]>();
  const tools: RegisteredTool[] = [];

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
    getAllTools() {
      return [...tools];
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

async function main(): Promise<void> {
  resetProtocolGlobals();

  const runtimeA = await startRuntime();
  const nodeResult = (await invokeProtocolTool(runtimeA, {
    action: "describe_node",
    nodeId: "pi-pi",
  })) as { ok: boolean; action: string; node?: { provides?: Array<{ name: string }> } };

  assert.equal(nodeResult.ok, true);
  assert.deepEqual(
    nodeResult.node?.provides?.map((provide) => provide.name),
    ["describe_certified_template", "build_certified_extension", "validate_certified_extension"],
    "fresh-session public surface should stay small",
  );

  const freshRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-fresh-builder-"));
  await writeFile(path.join(freshRepo, "LICENSE"), "MIT\n", "utf8");
  const freshBuild = (await invokeProtocolTool(runtimeA, {
    action: "invoke",
    request: {
      provide: "build_certified_extension",
      target: { nodeId: "pi-pi" },
      input: {
        description: "Build me a certified extension that summarizes markdown notes and offers a local command.",
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
        packages: Array<{ packageDir: string; provides: string[] }>;
        summary: string;
      };
    };
  };

  assert.equal(freshBuild.ok, true);
  assert.equal(freshBuild.result?.ok, true);
  assert.equal(freshBuild.result?.output?.status, "certified");
  assert.equal(freshBuild.result?.output?.packages.length, 1);
  assert.ok(freshBuild.result?.output?.summary.includes("Built 1 protocol-certified package"));
  assert.ok(
    freshBuild.result?.output?.packages[0]?.provides.includes("summarize_content") ||
      freshBuild.result?.output?.packages[0]?.provides.includes("summarize_notes"),
    "fresh repo with only harmless root files should stay on the greenfield builder path",
  );

  const freshValidation = (await invokeProtocolTool(runtimeA, {
    action: "invoke",
    request: {
      provide: "validate_certified_extension",
      target: { nodeId: "pi-pi" },
      input: { packageDir: freshRepo },
    },
  })) as { ok: boolean; result?: { ok: boolean; output?: { pass: boolean } } };
  assert.equal(freshValidation.ok, true);
  assert.equal(freshValidation.result?.ok, true);
  assert.equal(freshValidation.result?.output?.pass, true);

  await runtimeA.emit("session_shutdown", { reason: "done-a" });
  resetProtocolGlobals();

  const runtimeB = await startRuntime();
  const brownfieldRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-brownfield-builder-"));
  await mkdir(path.join(brownfieldRepo, "src"), { recursive: true });
  await writeFile(path.join(brownfieldRepo, "README.md"), "# brownfield\n", "utf8");
  await writeFile(path.join(brownfieldRepo, "src", "index.ts"), "export const legacy = true;\n", "utf8");

  const brownfieldFailure = (await invokeProtocolTool(runtimeB, {
    action: "invoke",
    request: {
      provide: "build_certified_extension",
      target: { nodeId: "pi-pi" },
      input: {
        description: "Build me a certified extension that validates a repository.",
        repoDir: brownfieldRepo,
        applyChanges: true,
      },
    },
  })) as { ok: boolean; result?: { ok: boolean; error?: { code: string; message: string } } };
  assert.equal(brownfieldFailure.ok, true);
  assert.equal(brownfieldFailure.result?.ok, false);
  assert.equal(brownfieldFailure.result?.error?.code, "INVALID_INPUT");
  assert.ok(brownfieldFailure.result?.error?.message.includes("replaceExisting:true"));

  const brownfieldSuccess = (await invokeProtocolTool(runtimeB, {
    action: "invoke",
    request: {
      provide: "build_certified_extension",
      target: { nodeId: "pi-pi" },
      input: {
        description: "Build me a certified extension that validates a repository.",
        repoDir: brownfieldRepo,
        replaceExisting: true,
        applyChanges: true,
      },
    },
  })) as {
    ok: boolean;
    result?: {
      ok: boolean;
      output?: { status: string; packages: Array<{ provides: string[] }> };
    };
  };
  assert.equal(brownfieldSuccess.ok, true);
  assert.equal(brownfieldSuccess.result?.ok, true);
  assert.equal(brownfieldSuccess.result?.output?.status, "certified");
  assert.ok(
    brownfieldSuccess.result?.output?.packages[0]?.provides.includes("validate_repo"),
    "brownfield replacement should keep the user brief as the target contract instead of exposing migration scaffolding",
  );

  const pairRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-pair-builder-"));
  const pairFailure = (await invokeProtocolTool(runtimeB, {
    action: "invoke",
    request: {
      provide: "build_certified_extension",
      target: { nodeId: "pi-pi" },
      input: {
        description: "Build a manager/worker certified pair that delegates research tasks to a worker.",
        repoDir: pairRepo,
        applyChanges: true,
      },
    },
  })) as { ok: boolean; result?: { ok: boolean; error?: { code: string } } };
  assert.equal(pairFailure.ok, true);
  assert.equal(pairFailure.result?.ok, false);
  assert.equal(pairFailure.result?.error?.code, "INVALID_INPUT");

  const pairSuccess = (await invokeProtocolTool(runtimeB, {
    action: "invoke",
    request: {
      provide: "build_certified_extension",
      target: { nodeId: "pi-pi" },
      input: {
        description: "Build a manager/worker certified pair that delegates research tasks to a worker.",
        repoDir: pairRepo,
        allowPair: true,
        applyChanges: true,
      },
      handoff: { opaque: true },
    },
  })) as {
    ok: boolean;
    result?: { ok: boolean; output?: { status: string; packages: Array<{ packageDir: string }> } };
  };
  assert.equal(pairSuccess.ok, true);
  assert.equal(pairSuccess.result?.ok, true);
  assert.equal(pairSuccess.result?.output?.status, "certified");
  assert.equal(pairSuccess.result?.output?.packages.length, 2);

  console.log("certified builder fresh-session flow passed");
  await runtimeB.emit("session_shutdown", { reason: "done-b" });
  resetProtocolGlobals();
}

main().catch((error: unknown) => {
  console.error(error);
  resetProtocolGlobals();
  process.exitCode = 1;
});
