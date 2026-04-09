import assert from "node:assert/strict";
import {
  DefaultResourceLoader,
  SessionManager,
  createAgentSession,
  type ExtensionFactory,
} from "@mariozechner/pi-coding-agent";
import activate from "../extensions/index.ts";

const PROTOCOL_TOOL_SNIPPET = "protocol: list public provides, inspect protocol nodes/provides, and invoke them through the shared fabric";
const PROMPT_AWARENESS_MARKER = "## Protocol-aware capability reuse";

async function main(): Promise<void> {
  // This uses a real AgentSession from the Pi SDK rather than the lightweight fake runtime
  // used in earlier regression tests. That lets us verify discoverability in an actual session.
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    extensionFactories: [activate as unknown as ExtensionFactory],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    appendSystemPromptOverride: () => [],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
  });

  // createAgentSession usually wires extensions already, but bindExtensions() is the documented
  // session-runtime-safe path and is harmless here because the protocol projection is idempotent.
  if (!session.getAllTools().some((tool) => tool.name === "protocol")) {
    await session.bindExtensions({});
  }

  const allTools = session.getAllTools();
  assert.ok(allTools.some((tool) => tool.name === "protocol"), "real AgentSession should expose the protocol tool");
  assert.ok(
    session.systemPrompt.includes(PROTOCOL_TOOL_SNIPPET),
    "real AgentSession system prompt should advertise the protocol tool snippet",
  );

  const extensionRunner = (session as typeof session & {
    extensionRunner?: {
      emitBeforeAgentStart: (
        prompt: string,
        images: undefined,
        systemPrompt: string,
      ) => Promise<{ systemPrompt?: string } | undefined>;
    };
  }).extensionRunner;
  assert.ok(extensionRunner, "AgentSession should expose an extension runner");

  const beforeAgentStartResult = await extensionRunner?.emitBeforeAgentStart(
    "Build me a new extension if nothing installed already solves this.",
    undefined,
    session.systemPrompt,
  );
  const effectiveSystemPrompt = beforeAgentStartResult?.systemPrompt ?? session.systemPrompt;

  assert.ok(
    effectiveSystemPrompt.includes(PROMPT_AWARENESS_MARKER),
    "before_agent_start should inject the protocol-awareness helper into real AgentSession turns",
  );
  assert.ok(
    effectiveSystemPrompt.includes("discover a public provide before doing local work"),
    "top-level chat path should be nudged toward protocol discovery for code-changing requests",
  );
  assert.ok(
    effectiveSystemPrompt.includes("Use `protocol` only for protocol work"),
    "prompt-awareness helper should tell the agent not to force protocol for every question",
  );
  assert.ok(
    effectiveSystemPrompt.includes("discover a public provide before doing local work"),
    "prompt-awareness helper should require discovery before local code-changing work",
  );
  assert.ok(
    effectiveSystemPrompt.includes("registry -> describe_node -> describe_provide -> invoke"),
    "prompt-awareness helper should explain the compact protocol path",
  );
  assert.ok(
    effectiveSystemPrompt.includes("ask that node") && effectiveSystemPrompt.includes("invoke its chat-like provide"),
    "prompt-awareness helper should tell the agent to actually ask the node when requested",
  );
  assert.ok(
    effectiveSystemPrompt.includes("For general chat, use `input.message`"),
    "prompt-awareness helper should tell the agent the canonical general-chat input field",
  );

  console.log("real AgentSession protocol discoverability passed");
  session.dispose();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
