import assert from "node:assert/strict";
import activate from "../extensions/index.ts";
import {
  classifyProtocolRoutingIntent,
  FABRIC_KEY,
  PROTOCOL_AGENT_PROJECTION_KEY,
  PROTOCOL_CONVERSATION_RENDERER_KEY,
  PROTOCOL_CONVERSATION_ROUTING_KEY,
  PROTOCOL_CONVERSATION_STATE_KEY,
  PROTOCOL_PROMPT_AWARENESS_KEY,
  PROTOCOL_SUBAGENT_STATUS_RENDERER_KEY,
  PROTOCOL_SUBAGENT_STREAM_RENDERER_KEY,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";

type EventHandler = (payload?: unknown) => Promise<unknown> | unknown;

interface TestPiRuntime extends ProtocolSessionPi {
  on: (event: string, handler: EventHandler) => void;
  emit: (event: string, payload?: unknown) => Promise<void>;
  runBeforeAgentStart: (prompt: string, systemPrompt: string) => Promise<string>;
  registerTool: (tool: { name: string }) => void;
  registerMessageRenderer: (_customType: string, _renderer: unknown) => void;
  registerCommand: (_name: string, _command: unknown) => void;
  sendMessage: (_message: unknown, _options?: unknown) => void;
  getAllTools?: () => Array<{ name: string }>;
  getActiveTools?: () => string[];
}

function resetProtocolGlobals(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_AGENT_PROJECTION_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_CONVERSATION_RENDERER_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_CONVERSATION_ROUTING_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_CONVERSATION_STATE_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_PROMPT_AWARENESS_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_SUBAGENT_STATUS_RENDERER_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_SUBAGENT_STREAM_RENDERER_KEY];
}

function createPiRuntime(): TestPiRuntime {
  const listeners = new Map<string, EventHandler[]>();
  const tools: Array<{ name: string }> = [];

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
    registerTool(tool: { name: string }) {
      tools.push(tool);
    },
    registerMessageRenderer() {
      // no-op
    },
    registerCommand() {
      // no-op
    },
    sendMessage() {
      // no-op
    },
    getAllTools() {
      return [...tools];
    },
    getActiveTools() {
      return tools.map((tool) => tool.name);
    },
  } as TestPiRuntime;
}

async function main(): Promise<void> {
  resetProtocolGlobals();

  assert.equal(classifyProtocolRoutingIntent("What is Pi Protocol?"), "direct");
  assert.equal(
    classifyProtocolRoutingIntent("Explain the difference between a node and a provide in one sentence."),
    "direct",
  );
  assert.equal(
    classifyProtocolRoutingIntent("Build a URL summarizer extension that reuses existing capabilities if available."),
    "protocol-first",
  );
  assert.equal(classifyProtocolRoutingIntent("Delete the extension that was created in this repo."), "protocol-first");
  assert.equal(
    classifyProtocolRoutingIntent("Remove the generated file and replace it with a protocol-aware version."),
    "protocol-first",
  );
  assert.equal(
    classifyProtocolRoutingIntent("Integrate a new command into an existing repo and migrate the bootstrap wiring."),
    "protocol-first",
  );
  assert.equal(
    classifyProtocolRoutingIntent("Inspect this project and validate the current protocol contract before changing anything."),
    "protocol-first",
  );

  const runtime = createPiRuntime();
  activate(runtime as never);
  await runtime.emit("session_start", { reason: "routing-policy" });

  const prompt = await runtime.runBeforeAgentStart("Build me a URL summarizer extension.", "BASE");
  assert.ok(prompt.includes("Use `protocol` only for protocol work"));
  assert.ok(prompt.includes("Valid top-level protocol actions are exactly"));
  assert.ok(prompt.includes("Use `query` only as the nested filter object for `find_provides`"));
  assert.ok(prompt.includes("discover a public provide before doing local work"));
  assert.ok(prompt.includes("registry -> describe_node -> describe_provide -> invoke"));
  assert.ok(prompt.includes("ask that node") && prompt.includes("invoke its chat-like provide"));
  assert.ok(prompt.includes("For general chat, use `input.message`"));
  assert.ok(prompt.includes("usually stop") || prompt.includes("visible conversational invoke result"));

  console.log("protocol routing policy passed");
  resetProtocolGlobals();
}

main().catch((error: unknown) => {
  console.error(error);
  resetProtocolGlobals();
  process.exitCode = 1;
});
