import assert from "node:assert/strict";
import activate from "../extensions/index.ts";
import {
  FABRIC_KEY,
  PROTOCOL_AGENT_PROJECTION_KEY,
  PROTOCOL_PROMPT_AWARENESS_KEY,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";

const PROMPT_AWARENESS_MARKER = "## Protocol-aware capability reuse";

interface RegisteredTool {
  name: string;
}

type EventHandler = (payload?: unknown) => Promise<unknown> | unknown;

interface TestPiRuntime extends ProtocolSessionPi {
  on: (event: string, handler: EventHandler) => void;
  emit: (event: string, payload?: unknown) => Promise<void>;
  runBeforeAgentStart: (prompt: string, systemPrompt: string) => Promise<string>;
  registerTool: (tool: RegisteredTool) => void;
  registerCommand?: (name: string, command: unknown) => void;
  getAllTools: () => RegisteredTool[];
  getActiveTools: () => string[];
  countTool: (toolName: string) => number;
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
    getAllTools() {
      return [...tools];
    },
    getActiveTools() {
      return tools.map((tool) => tool.name);
    },
    countTool(toolName: string) {
      return tools.filter((tool) => tool.name === toolName).length;
    },
  } as TestPiRuntime;
}

async function main(): Promise<void> {
  resetProtocolGlobals();

  const runtimeA = createPiRuntime();
  activate(runtimeA as unknown as Parameters<typeof activate>[0]);
  await runtimeA.emit("session_start", { reason: "regression-a" });
  assert.equal(runtimeA.countTool("protocol"), 1, "protocol tool should register on first runtime session_start");

  await runtimeA.emit("session_start", { reason: "regression-a-repeat" });
  assert.equal(runtimeA.countTool("protocol"), 1, "protocol tool should not duplicate on repeated session_start");

  const promptA = await runtimeA.runBeforeAgentStart("Build me a capability if needed.", "BASE");
  assert.equal(
    promptA.split(PROMPT_AWARENESS_MARKER).length - 1,
    1,
    "prompt-awareness helper should append exactly one protocol-aware section",
  );

  const runtimeB = createPiRuntime();
  activate(runtimeB as unknown as Parameters<typeof activate>[0]);
  await runtimeB.emit("session_start", { reason: "regression-b" });
  assert.equal(
    runtimeB.countTool("protocol"),
    1,
    "protocol tool should also register for a second runtime in the same process",
  );

  const promptB = await runtimeB.runBeforeAgentStart("See whether something installed can already do this.", "BASE");
  assert.equal(
    promptB.split(PROMPT_AWARENESS_MARKER).length - 1,
    1,
    "prompt-awareness helper should install once per runtime and avoid duplicated prompt text",
  );

  console.log("protocol projection and prompt-awareness regressions passed");
  resetProtocolGlobals();
}

main().catch((error: unknown) => {
  console.error(error);
  resetProtocolGlobals();
  process.exitCode = 1;
});
