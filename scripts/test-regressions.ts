import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import activate from "../extensions/index.ts";
import {
  FABRIC_KEY,
  PROTOCOL_AGENT_PROJECTION_KEY,
  PROTOCOL_PROMPT_AWARENESS_KEY,
  type ProtocolHandler,
  type ProtocolSessionPi,
  registerProtocolNode,
} from "../vendor/pi-protocol-sdk.ts";
import {
  planBrownfieldMigration,
  planCertifiedNodeFromDescription,
} from "../protocol/core.ts";

const PROMPT_AWARENESS_MARKER = "## Protocol-aware capability reuse";

interface RegisteredTool {
  name: string;
  execute?: (toolCallId: string, input: unknown) => Promise<{ content?: Array<{ type: string; text?: string }> }>;
}

type EventHandler = (payload?: unknown) => Promise<unknown> | unknown;

interface TestPiRuntime extends ProtocolSessionPi {
  on: (event: string, handler: EventHandler) => void;
  emit: (event: string, payload?: unknown) => Promise<void>;
  runBeforeAgentStart: (prompt: string, systemPrompt: string) => Promise<string>;
  registerTool: (tool: RegisteredTool) => void;
  registerMessageRenderer: (customType: string, renderer: unknown) => void;
  registerCommand?: (name: string, command: unknown) => void;
  getAllTools: () => RegisteredTool[];
  getActiveTools: () => string[];
  countTool: (toolName: string) => number;
  getMessageRendererTypes: () => string[];
}

function resetProtocolGlobals(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_AGENT_PROJECTION_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_PROMPT_AWARENESS_KEY];
}

function createPiRuntime(): TestPiRuntime {
  const listeners = new Map<string, EventHandler[]>();
  const tools: RegisteredTool[] = [];
  const messageRendererTypes: string[] = [];

  return {
    appendEntry() {
      // no-op test sink
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
    async runBeforeAgentStart(prompt: string, systemPrompt: string) {
      let currentSystemPrompt = systemPrompt;
      for (const handler of listeners.get("before_agent_start") ?? []) {
        const result = await handler({ prompt, systemPrompt: currentSystemPrompt });
        if (
          result &&
          typeof result === "object" &&
          "systemPrompt" in result &&
          typeof result.systemPrompt === "string"
        ) {
          currentSystemPrompt = result.systemPrompt;
        }
      }
      return currentSystemPrompt;
    },
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
    registerMessageRenderer(customType: string) {
      messageRendererTypes.push(customType);
    },
    getAllTools() {
      return [...tools];
    },
    getActiveTools() {
      return tools.map((tool) => tool.name);
    },
    countTool(toolName: string) {
      return tools.filter((tool) => tool.name === toolName).length;
    },
    getMessageRendererTypes() {
      return [...messageRendererTypes];
    },
  } as TestPiRuntime;
}

async function main(): Promise<void> {
  resetProtocolGlobals();

  const originalCwd = process.cwd();
  const foreignCwd = await mkdtemp(path.join(os.tmpdir(), "pi-pi-foreign-cwd-"));
  const brownfieldRepo = path.join(foreignCwd, "repo");
  await writeFile(path.join(foreignCwd, "README.md"), "# temp\n", "utf8");
  await writeFile(path.join(foreignCwd, ".placeholder"), "ok\n", "utf8");
  await writeFile(path.join(foreignCwd, "repo"), "", "utf8").catch(() => undefined);

  process.chdir(foreignCwd);
  try {
    const planFromBrief = await planCertifiedNodeFromDescription({
      description: "Build a URL summarizer extension",
    });
    assert.equal(planFromBrief.brief, "Build a URL summarizer extension");

    const brownfieldDir = await mkdtemp(path.join(os.tmpdir(), "pi-pi-regression-brownfield-"));
    await writeFile(path.join(brownfieldDir, "README.md"), "# repo\n", "utf8");
    const brownfieldPlan = await planBrownfieldMigration({
      repoDir: brownfieldDir,
    });
    assert.equal(brownfieldPlan.repoDir, path.resolve(brownfieldDir));
  } finally {
    process.chdir(originalCwd);
  }

  const runtime = createPiRuntime();
  const fabric = activate(runtime as unknown as Parameters<typeof activate>[0]);
  await runtime.emit("session_start", { reason: "regression-a" });
  assert.equal(runtime.countTool("protocol"), 1, "protocol tool should register on first runtime session_start");
  assert.ok(
    runtime.getMessageRendererTypes().includes("protocol-handoff"),
    "handoff should register a normal-session message renderer",
  );

  await runtime.emit("session_start", { reason: "regression-a-repeat" });
  assert.equal(runtime.countTool("protocol"), 1, "protocol tool should not duplicate on repeated session_start");

  const protocolTool = runtime.getAllTools().find((tool) => tool.name === "protocol");
  assert.ok(protocolTool?.execute, "protocol tool should expose an execute function");

  const registryResult = await protocolTool?.execute?.("tool-call-1", { action: "registry" });
  const registryText = registryResult?.content?.[0]?.text ?? "";
  assert.ok(registryText.includes("available nodes:"));
  assert.ok(registryText.includes("- pi-pi —"));
  assert.ok(!registryText.includes("plan_extension_from_brief"), "internal provides should stay hidden from registry text");

  const nodeResult = await protocolTool?.execute?.("tool-call-2", { action: "describe_node", nodeId: "pi-pi" });
  const nodeText = nodeResult?.content?.[0]?.text ?? "";
  assert.ok(nodeText.includes("build_certified_extension"));
  assert.ok(!nodeText.includes("describe_certified_template"));
  assert.ok(!nodeText.includes("validate_certified_extension"));
  assert.ok(!nodeText.includes("plan_extension_from_brief"));

  const qualifiedProvideResult = await protocolTool?.execute?.("tool-call-2b", {
    action: "describe_provide",
    nodeId: "pi-pi",
    provide: "pi-pi.build_certified_extension",
  });
  const qualifiedProvideText = qualifiedProvideResult?.content?.[0]?.text ?? "";
  assert.ok(qualifiedProvideText.includes("provide pi-pi.build_certified_extension"));
  assert.ok(qualifiedProvideText.includes("schema note: string schema paths are relative to the providing node package"));

  const legacyShapeRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-regression-legacy-shape-"));
  const legacyShapeInvokeResult = await protocolTool?.execute?.("tool-call-2c", {
    action: "invoke",
    nodeId: "pi-pi",
    provide: "pi-pi.build_certified_extension",
    request: {
      input: {
        description: "Build a certified extension that summarizes markdown notes and also offers a local command.",
        repoDir: legacyShapeRepo,
        applyChanges: false,
      },
      routing: "local",
      handoff: { opaque: true },
    },
  });
  const legacyShapeInvokeText = legacyShapeInvokeResult?.content?.[0]?.text ?? "";
  assert.ok(legacyShapeInvokeText.includes('"ok": true'));

  const internalSelfInvoke = await fabric.invoke({
    callerNodeId: "pi-pi",
    provide: "plan_extension_from_brief",
    target: { nodeId: "pi-pi" },
    input: { description: "Build a URL summarizer extension" },
  });
  assert.equal(internalSelfInvoke.ok, true, "node-local internal provides should remain invocable through the fabric");

  const foreignInvoke = await fabric.invoke({
    callerNodeId: "pi-chat",
    provide: "plan_extension_from_brief",
    target: { nodeId: "pi-pi" },
    input: { description: "Build a URL summarizer extension" },
  });
  assert.equal(foreignInvoke.ok, false, "cross-node callers should not reach internal provides");

  const noopHandler: ProtocolHandler = async () => ({ ok: true });
  for (let index = 0; index < 25; index += 1) {
    const nodeId = `test-node-${index}`;
    registerProtocolNode(runtime, fabric, {
      manifest: {
        protocolVersion: "0.1.0",
        nodeId,
        purpose: `Synthetic registry scaling fixture ${index}`,
        provides: Array.from({ length: 4 }, (_value, provideIndex) => ({
          name: `provide_${provideIndex}`,
          description: `Fixture provide ${provideIndex}`,
          handler: `provide_${provideIndex}`,
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          visibility: "public",
          tags: [index % 2 === 0 ? "fixture-even" : "fixture-odd"],
        })),
      },
      handlers: Object.fromEntries(
        Array.from({ length: 4 }, (_value, provideIndex) => [`provide_${provideIndex}`, noopHandler]),
      ),
    });
  }

  const largeRegistryResult = await protocolTool?.execute?.("tool-call-3", { action: "registry" });
  const largeRegistryText = largeRegistryResult?.content?.[0]?.text ?? "";
  assert.ok(largeRegistryText.includes("registry is intentionally node-first here so token cost scales with nodes rather than total provides"));

  const prompt = await runtime.runBeforeAgentStart("Build me a capability if needed.", "BASE");
  assert.equal(prompt.split(PROMPT_AWARENESS_MARKER).length - 1, 1);
  assert.ok(prompt.includes("If discovery finds a matching public builder provide"));
  assert.ok(prompt.includes("do not freestyle a non-certified fallback") || prompt.includes("non-certified local fallback"));

  console.log("protocol projection and internal-visibility regressions passed");
  resetProtocolGlobals();
}

main().catch((error: unknown) => {
  console.error(error);
  resetProtocolGlobals();
  process.exitCode = 1;
});
