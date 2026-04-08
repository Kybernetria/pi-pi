import assert from "node:assert/strict";
import {
  classifyProtocolRoutingIntent,
  ensureProtocolPromptAwareness,
  FABRIC_KEY,
  PROTOCOL_AGENT_PROJECTION_KEY,
  PROTOCOL_PROMPT_AWARENESS_KEY,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";

type EventHandler = (payload?: unknown) => Promise<unknown> | unknown;

interface TestPiRuntime extends ProtocolSessionPi {
  on: (event: string, handler: EventHandler) => void;
  runBeforeAgentStart: (prompt: string, systemPrompt: string) => Promise<string>;
  getAllTools?: () => Array<{ name: string }>;
  getActiveTools?: () => string[];
}

function resetProtocolGlobals(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_AGENT_PROJECTION_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_PROMPT_AWARENESS_KEY];
}

function createPiRuntime(): TestPiRuntime {
  const listeners = new Map<string, EventHandler[]>();
  const tools = [{ name: "protocol" }];

  return {
    appendEntry() {
      // no-op
    },
    on(event: string, handler: EventHandler) {
      const current = listeners.get(event) ?? [];
      current.push(handler);
      listeners.set(event, current);
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
    getAllTools() {
      return tools;
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
  ensureProtocolPromptAwareness(runtime as unknown as Parameters<typeof ensureProtocolPromptAwareness>[0], {
    toolName: "protocol",
  });

  const prompt = await runtime.runBeforeAgentStart("Build me a URL summarizer extension.", "BASE");
  assert.ok(prompt.includes("Route simple questions, explanations, and quick lookups directly"));
  assert.ok(
    prompt.includes(
      "For any request that creates, edits, deletes, builds, modifies, integrates, migrates, validates, or reuses code",
    ),
  );
  assert.ok(prompt.includes("If no installed capability fits, proceed directly"));
  assert.ok(prompt.includes("Use tiered discovery: start with the compact node-level registry"));

  console.log("protocol routing policy passed");
  resetProtocolGlobals();
}

main().catch((error: unknown) => {
  console.error(error);
  resetProtocolGlobals();
  process.exitCode = 1;
});
