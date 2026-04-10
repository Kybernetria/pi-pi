import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import activate from "../extensions/index.ts";
import {
  FABRIC_KEY,
  PROTOCOL_AGENT_PROJECTION_KEY,
  PROTOCOL_CONVERSATION_RENDERER_KEY,
  PROTOCOL_CONVERSATION_ROUTING_KEY,
  PROTOCOL_CONVERSATION_STATE_KEY,
  PROTOCOL_PROMPT_AWARENESS_KEY,
  PROTOCOL_SUBAGENT_STATUS_RENDERER_KEY,
  PROTOCOL_SUBAGENT_STREAM_RENDERER_KEY,
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

interface RegisteredCommand {
  description: string;
  handler: (args: string, ctx: unknown) => Promise<void> | void;
}

interface CustomMessage {
  customType: string;
  content: string;
  details?: unknown;
}

type EventHandler = (payload?: unknown) => Promise<unknown> | unknown;

interface TestPiRuntime extends ProtocolSessionPi {
  on: (event: string, handler: EventHandler) => void;
  emit: (event: string, payload?: unknown) => Promise<void>;
  runBeforeAgentStart: (prompt: string, systemPrompt: string) => Promise<string>;
  registerTool: (tool: RegisteredTool) => void;
  registerMessageRenderer: (customType: string, renderer: unknown) => void;
  registerCommand: (name: string, command: RegisteredCommand) => void;
  sendMessage: (message: unknown, options?: unknown) => void;
  getAllTools: () => RegisteredTool[];
  getActiveTools: () => string[];
  countTool: (toolName: string) => number;
  getMessageRendererTypes: () => string[];
  getMessageRenderer: (customType: string) => unknown;
  getCommands: () => string[];
  getMessages: () => CustomMessage[];
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

function findLastMessage(messages: CustomMessage[], customType: string): CustomMessage | undefined {
  return [...messages].reverse().find((message) => message.customType === customType);
}

function createPiRuntime(): TestPiRuntime {
  const listeners = new Map<string, EventHandler[]>();
  const tools: RegisteredTool[] = [];
  const commands = new Map<string, RegisteredCommand>();
  const messageRendererTypes: string[] = [];
  const messageRenderers = new Map<string, unknown>();
  const messages: CustomMessage[] = [];

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
    registerMessageRenderer(customType: string, renderer: unknown) {
      messageRendererTypes.push(customType);
      messageRenderers.set(customType, renderer);
    },
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    sendMessage(message: unknown) {
      messages.push(message as CustomMessage);
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
    getMessageRenderer(customType: string) {
      return messageRenderers.get(customType);
    },
    getCommands() {
      return [...commands.keys()];
    },
    getMessages() {
      return [...messages];
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
  assert.ok(
    runtime.getMessageRendererTypes().includes("chat-pi-pi-result"),
    "chat command results should register a visible custom message renderer",
  );
  assert.ok(
    runtime.getMessageRendererTypes().includes("protocol-invoke-result"),
    "protocol invoke results should register a visible custom message renderer",
  );
  assert.ok(
    runtime.getMessageRendererTypes().includes("protocol-conversation"),
    "conversation ownership changes should register a visible custom message renderer",
  );
  assert.ok(
    runtime.getMessageRendererTypes().includes("protocol-subagent-status"),
    "subagent status updates should register a visible custom message renderer",
  );
  assert.ok(
    runtime.getMessageRendererTypes().includes("protocol-subagent-stream"),
    "subagent live stream updates should register a visible custom message renderer",
  );
  assert.ok(runtime.getCommands().includes("chat-pi-pi"), "chat command projection should register");

  const fakeTheme = {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
  const invokeRenderer = runtime.getMessageRenderer("protocol-invoke-result") as
    | ((message: CustomMessage, options: { expanded: boolean }, theme: typeof fakeTheme) => { render: (width: number) => string[]; addChild?: unknown })
    | undefined;
  const invokeComponent = invokeRenderer?.({
    customType: "protocol-invoke-result",
    content: "Delegated reply body",
    details: {
      nodeId: "pi-pi",
      provide: "chat_pi_pi",
      status: "clarification_needed",
      continuationState: "awaiting_user",
      continuationOwnerLabel: "pi-pi",
      continuationToken: "tok-render",
    },
  }, { expanded: false }, fakeTheme);
  assert.ok(
    invokeComponent && typeof invokeComponent.addChild === "function",
    "host projection should override protocol invoke results with a boxed renderer",
  );
  const invokeRendered = invokeComponent?.render(80).join("\n") ?? "";
  assert.ok(invokeRendered.includes("Talking to: pi-pi"));
  assert.ok(invokeRendered.includes("Delegated reply body"));
  assert.ok(invokeRendered.includes("Awaiting reply"));

  const completedInvokeComponent = invokeRenderer?.({
    customType: "protocol-invoke-result",
    content: "Delegated reply body",
    details: {
      nodeId: "pi-pi",
      provide: "chat_pi_pi",
      status: "completed",
      reply: "Delegated reply body",
      continuationState: "closed",
      continuationOwnerLabel: "pi-pi",
    },
  }, { expanded: false }, fakeTheme);
  const completedInvokeRendered = completedInvokeComponent?.render(80).join("\n") ?? "";
  assert.ok(completedInvokeRendered.includes("Completed"));
  assert.ok(!completedInvokeRendered.includes("Awaiting reply"));

  const chatRenderer = runtime.getMessageRenderer("chat-pi-pi-result") as
    | ((message: CustomMessage, options: { expanded: boolean }, theme: typeof fakeTheme) => { render: (width: number) => string[]; addChild?: unknown })
    | undefined;
  const chatComponent = chatRenderer?.({
    customType: "chat-pi-pi-result",
    content: "Need one more detail.",
    details: {
      nodeId: "pi-pi",
      provide: "chat_pi_pi",
      status: "clarification_needed",
      reply: "Need one more detail.",
      questions: ["What repo should I use?"],
      assumptionsOffered: ["I can use the current working directory."],
      canProceedWithAssumptions: true,
      continuationState: "awaiting_user",
      continuationToken: "tok-chat-render",
    },
  }, { expanded: true }, fakeTheme);
  assert.ok(chatComponent && typeof chatComponent.addChild === "function");
  const chatRendered = chatComponent?.render(80).join("\n") ?? "";
  assert.ok(chatRendered.includes("Awaiting reply"));
  assert.ok(chatRendered.includes("Questions:"));
  assert.ok(chatRendered.includes("Assumptions I can use:"));
  assert.ok(chatRendered.includes("Next step: reply"));

  const statusRenderer = runtime.getMessageRenderer("protocol-subagent-status") as
    | ((message: CustomMessage, options: { expanded: boolean }, theme: typeof fakeTheme) => { render: (width: number) => string[]; addChild?: unknown })
    | undefined;
  const statusComponent = statusRenderer?.({
    customType: "protocol-subagent-status",
    content: "pi-pi.chat_pi_pi — waiting_user",
    details: {
      kind: "subagent_status",
      traceId: "trace-render",
      spanId: "span-render",
      nodeId: "pi-pi",
      provide: "chat_pi_pi",
      depth: 1,
      timestamp: Date.now(),
      label: "pi-pi",
      breadcrumb: ["main", "pi-pi"],
      status: "waiting_user",
      summary: "waiting for user reply",
    },
  }, { expanded: false }, fakeTheme);
  assert.ok(
    statusComponent && typeof statusComponent.addChild === "function",
    "host projection should override delegated status messages with a boxed renderer",
  );
  const statusRendered = statusComponent?.render(80).join("\n") ?? "";
  assert.ok(statusRendered.includes("Talking to: pi-pi"));
  assert.ok(statusRendered.includes("Awaiting reply"));

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
  assert.ok(nodeText.includes("chat_pi_pi"));
  assert.ok(!nodeText.includes("build_certified_extension"));
  assert.ok(!nodeText.includes("describe_certified_template"));
  assert.ok(!nodeText.includes("validate_certified_extension"));
  assert.ok(!nodeText.includes("plan_extension_from_brief"));

  const qualifiedProvideResult = await protocolTool?.execute?.("tool-call-2b", {
    action: "describe_provide",
    nodeId: "pi-pi",
    provide: "pi-pi.chat_pi_pi",
  });
  const qualifiedProvideText = qualifiedProvideResult?.content?.[0]?.text ?? "";
  assert.ok(qualifiedProvideText.includes("provide pi-pi.chat_pi_pi"));
  assert.ok(qualifiedProvideText.includes("schema note: string schema paths are relative to the providing node package"));
  assert.ok(qualifiedProvideText.includes("fast path: this provide appears conversational"));
  assert.ok(qualifiedProvideText.includes("avoid filesystem schema lookup unless invoke fails"));

  const legacyShapeRepo = await mkdtemp(path.join(os.tmpdir(), "pi-pi-regression-legacy-shape-"));
  const legacyShapeInvokeResult = await protocolTool?.execute?.("tool-call-2c", {
    action: "invoke",
    nodeId: "pi-pi",
    provide: "pi-pi.chat_pi_pi",
    request: {
      input: {
        message: "Build a certified extension that summarizes markdown notes and also offers a local command.",
        repoDir: legacyShapeRepo,
        applyChanges: false,
      },
      routing: "local",
      handoff: { opaque: true },
    },
  });
  const legacyShapeInvokeText = legacyShapeInvokeResult?.content?.[0]?.text ?? "";
  assert.ok(legacyShapeInvokeText.includes("invoke pi-pi.chat_pi_pi"));
  assert.ok(legacyShapeInvokeText.includes("status: completed"));
  assert.ok(legacyShapeInvokeText.includes("buildStatus: source_validated"));
  assert.ok(legacyShapeInvokeText.includes(`repoDir: ${legacyShapeRepo}`));

  const invokeChatResult = await protocolTool?.execute?.("tool-call-2d", {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        message: "what can you do for me",
      },
    },
  });
  const invokeChatText = invokeChatResult?.content?.[0]?.text ?? "";
  assert.ok(invokeChatText.includes("invoke pi-pi.chat_pi_pi"));
  assert.ok(invokeChatText.includes("visible reply shown separately"));
  const invokeMessage = findLastMessage(runtime.getMessages(), "protocol-invoke-result");
  assert.equal(invokeMessage?.customType, "protocol-invoke-result");
  assert.ok(typeof invokeMessage?.content === "string" && invokeMessage.content.length > 0);
  assert.ok(!invokeMessage?.content.includes('"ok": true'));
  const conversationMessage = findLastMessage(runtime.getMessages(), "protocol-conversation");
  assert.equal(conversationMessage?.customType, "protocol-conversation");
  const invokeMessageDetails = invokeMessage?.details as { nodeId?: string; provide?: string; continuationState?: string; continuationOwnerLabel?: string } | undefined;
  assert.equal(invokeMessageDetails?.nodeId, "pi-pi");
  assert.equal(invokeMessageDetails?.provide, "chat_pi_pi");

  const invokeClarificationResult = await protocolTool?.execute?.("tool-call-2d-awaiting", {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        message: "",
      },
    },
  });
  const invokeClarificationText = invokeClarificationResult?.content?.[0]?.text ?? "";
  assert.ok(invokeClarificationText.includes("status: awaiting_reply"));
  assert.ok(invokeClarificationText.includes("conversationToken:"));
  const clarificationMessage = findLastMessage(runtime.getMessages(), "protocol-invoke-result");
  const clarificationMessageDetails = clarificationMessage?.details as { continuationState?: string; continuationOwnerLabel?: string } | undefined;
  assert.equal(clarificationMessageDetails?.continuationState, "awaiting_user");
  assert.equal(clarificationMessageDetails?.continuationOwnerLabel, "pi-pi");

  await assert.rejects(
    async () => protocolTool?.execute?.("tool-call-2e-query", {
      action: "query",
      query: {
        name: "chat",
        visibility: "public",
      },
    }),
    /Invalid protocol action "query".*find_provides.*nested query object/i,
  );

  const invokeWithPublicRouting = await protocolTool?.execute?.("tool-call-2e-public", {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        message: "what can you do for me",
      },
      routing: "public",
    },
  });
  const invokeWithPublicRoutingText = invokeWithPublicRouting?.content?.[0]?.text ?? "";
  assert.ok(invokeWithPublicRoutingText.includes("invoke pi-pi.chat_pi_pi"));
  assert.ok(invokeWithPublicRoutingText.includes("visible reply shown separately"));

  const malformedInvokeResult = await protocolTool?.execute?.("tool-call-2e", {
    action: "invoke",
    request: {
      provide: "chat_pi_pi",
      target: { nodeId: "pi-pi" },
      input: {
        text: "what can you do for me",
      },
    },
  });
  const malformedInvokeText = malformedInvokeResult?.content?.[0]?.text ?? "";
  assert.ok(malformedInvokeText.includes('"ok": false'));
  assert.ok(malformedInvokeText.includes('"code": "INVALID_INPUT"'));
  assert.ok(malformedInvokeText.includes("input.message:string"));
  assert.ok(malformedInvokeText.includes("use message, not text, prompt, query, or content"));

  let resolveSlowConversation: (() => void) | undefined;
  const slowConversationHandler: ProtocolHandler = async () => {
    await new Promise<void>((resolve) => {
      resolveSlowConversation = resolve;
    });
    return {
      status: "completed",
      reply: "Slow conversational invoke finished.",
    };
  };

  registerProtocolNode(runtime, fabric, {
    manifest: {
      protocolVersion: "0.1.0",
      nodeId: "slow-node",
      purpose: "Slow conversational fixture",
      provides: [
        {
          name: "chat_slow",
          description: "Slow conversational fixture",
          handler: "chat_slow",
          inputSchema: {
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string" },
            },
          },
          outputSchema: {
            type: "object",
            required: ["status", "reply"],
            properties: {
              status: { type: "string" },
              reply: { type: "string" },
            },
          },
          visibility: "public",
        },
      ],
    },
    handlers: { chat_slow: slowConversationHandler as ProtocolHandler },
  });

  const slowInvokePromise = protocolTool?.execute?.("tool-call-live-status", {
    action: "invoke",
    request: {
      provide: "chat_slow",
      target: { nodeId: "slow-node" },
      input: {
        message: "start the slow test",
      },
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(
    runtime.getMessages().some((message) => message.customType === "protocol-subagent-status" && message.content.includes("slow-node.chat_slow")),
    "protocol tool conversational invoke should emit a visible delegated status message before the invoke finishes",
  );
  resolveSlowConversation?.();
  await slowInvokePromise;

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
  assert.ok(prompt.includes("Use `protocol` only for protocol work"));
  assert.ok(prompt.includes("Valid top-level protocol actions are exactly"));
  assert.ok(prompt.includes("`find_provides`"));
  assert.ok(prompt.includes("Use `query` only as the nested filter object for `find_provides`"));
  assert.ok(prompt.includes("discover a public provide before doing local work"));
  assert.ok(prompt.includes("registry -> describe_node -> describe_provide -> invoke"));
  assert.ok(prompt.includes("ask that node") && prompt.includes("invoke its chat-like provide"));
  assert.ok(prompt.includes("For general chat, use `input.message`"));
  assert.ok(prompt.includes("visible conversational invoke result") || prompt.includes("usually stop"));
  assert.ok(prompt.includes("next user reply") && prompt.includes("addressed to that node"));

  console.log("protocol projection and internal-visibility regressions passed");
  resetProtocolGlobals();
}

main().catch((error: unknown) => {
  console.error(error);
  resetProtocolGlobals();
  process.exitCode = 1;
});
