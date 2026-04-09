import assert from "node:assert/strict";
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
  registerProtocolNode,
  type ProtocolHandler,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";

type EventHandler = (payload?: unknown) => Promise<unknown> | unknown;

type InputResult =
  | { action: "continue" }
  | { action: "transform"; text: string; images?: unknown[] }
  | { action: "handled" }
  | void;

interface RegisteredTool {
  name: string;
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

interface TestPiRuntime extends ProtocolSessionPi {
  on: (event: string, handler: EventHandler) => void;
  emit: (event: string, payload?: unknown) => Promise<unknown[]>;
  runInput: (text: string) => Promise<InputResult>;
  registerTool: (tool: RegisteredTool) => void;
  registerMessageRenderer: (customType: string, renderer: unknown) => void;
  registerCommand: (name: string, command: RegisteredCommand) => void;
  sendMessage: (message: unknown, options?: unknown) => void;
  getMessageRendererTypes: () => string[];
  getMessages: () => CustomMessage[];
}

function resetProtocolGlobals(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_AGENT_PROJECTION_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_PROMPT_AWARENESS_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_CONVERSATION_RENDERER_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_CONVERSATION_ROUTING_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_CONVERSATION_STATE_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_SUBAGENT_STATUS_RENDERER_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_SUBAGENT_STREAM_RENDERER_KEY];
}

function createPiRuntime(): TestPiRuntime {
  const listeners = new Map<string, EventHandler[]>();
  const tools: RegisteredTool[] = [];
  const commands = new Map<string, RegisteredCommand>();
  const messageRendererTypes: string[] = [];
  const messages: CustomMessage[] = [];

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
      const results: unknown[] = [];
      for (const handler of listeners.get(event) ?? []) {
        results.push(await handler(payload));
      }
      return results;
    },
    async runInput(text: string) {
      let lastResult: InputResult = { action: "continue" };
      for (const handler of listeners.get("input") ?? []) {
        const result = (await handler({ text, source: "interactive" })) as InputResult;
        if (result) {
          lastResult = result;
          if (result.action === "handled" || result.action === "transform") {
            return result;
          }
        }
      }
      return lastResult;
    },
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
    registerMessageRenderer(customType: string) {
      messageRendererTypes.push(customType);
    },
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    sendMessage(message: unknown) {
      messages.push(message as CustomMessage);
    },
    getMessageRendererTypes() {
      return [...messageRendererTypes];
    },
    getMessages() {
      return [...messages];
    },
  } as TestPiRuntime;
}

function findLastMessage(messages: CustomMessage[], customType: string): CustomMessage | undefined {
  return [...messages].reverse().find((message) => message.customType === customType);
}

function createChatOutput(token: string, state: "awaiting_user" | "awaiting_caller" | "closed", ownerNodeId: string, ownerProvide: string, ownerLabel: string, reply: string) {
  return {
    status: state === "closed" || state === "awaiting_caller" ? "completed" : "clarification_needed",
    reply,
    continuation: {
      token,
      state,
      owner: {
        nodeId: ownerNodeId,
        provide: ownerProvide,
        label: ownerLabel,
      },
    },
  };
}

const parentInvocationLog: Array<{ message: string; conversationToken?: string }> = [];

const chat_parent: ProtocolHandler<{ message: string; conversationToken?: string }, ReturnType<typeof createChatOutput>> = async (_ctx, input) => {
  parentInvocationLog.push({ message: input.message, conversationToken: input.conversationToken });
  return createChatOutput(
    input.conversationToken ?? "parent-1",
    "awaiting_user",
    "parent-node",
    "chat_parent",
    "parent",
    input.conversationToken ? `Parent continued: ${input.message}` : "Parent needs one more detail.",
  );
};

const chat_child: ProtocolHandler<{ message: string; conversationToken?: string }, ReturnType<typeof createChatOutput>> = async (_ctx, input) => {
  const token = input.conversationToken ?? "child-1";
  if (input.message === "close") {
    return createChatOutput(token, "closed", "child-node", "chat_child", "child", "Child closed.");
  }
  if (input.message === "return") {
    return createChatOutput(token, "awaiting_caller", "child-node", "chat_child", "child", "Child returned control to the parent.");
  }
  return createChatOutput(token, "awaiting_user", "child-node", "chat_child", "child", "Child needs one more detail.");
};

async function main(): Promise<void> {
  resetProtocolGlobals();

  const runtime = createPiRuntime();
  const fabric = activate(runtime as unknown as Parameters<typeof activate>[0]);
  await runtime.emit("session_start", { reason: "conversation-test" });

  assert.ok(runtime.getMessageRendererTypes().includes("protocol-conversation"), "conversation renderer should register");

  registerProtocolNode(runtime, fabric, {
    manifest: {
      protocolVersion: "0.1.0",
      nodeId: "parent-node",
      purpose: "Recursive conversation parent fixture",
      provides: [
        {
          name: "chat_parent",
          description: "Conversational parent fixture",
          handler: "chat_parent",
          inputSchema: {
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string" },
              conversationToken: { type: "string" },
            },
          },
          outputSchema: {
            type: "object",
            required: ["status", "reply", "continuation"],
            properties: {
              status: { type: "string" },
              reply: { type: "string" },
              continuation: {
                type: "object",
                required: ["token", "state", "owner"],
                properties: {
                  token: { type: "string" },
                  state: { type: "string" },
                  owner: {
                    type: "object",
                    required: ["nodeId", "provide"],
                    properties: {
                      nodeId: { type: "string" },
                      provide: { type: "string" },
                      label: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
    handlers: { chat_parent: chat_parent as ProtocolHandler },
  });

  registerProtocolNode(runtime, fabric, {
    manifest: {
      protocolVersion: "0.1.0",
      nodeId: "child-node",
      purpose: "Conversational child fixture",
      provides: [
        {
          name: "chat_child",
          description: "Conversational child fixture",
          handler: "chat_child",
          inputSchema: {
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string" },
              conversationToken: { type: "string" },
            },
          },
          outputSchema: {
            type: "object",
            required: ["status", "reply", "continuation"],
            properties: {
              status: { type: "string" },
              reply: { type: "string" },
              continuation: {
                type: "object",
                required: ["token", "state", "owner"],
                properties: {
                  token: { type: "string" },
                  state: { type: "string" },
                  owner: {
                    type: "object",
                    required: ["nodeId", "provide"],
                    properties: {
                      nodeId: { type: "string" },
                      provide: { type: "string" },
                      label: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
    handlers: { chat_child: chat_child as ProtocolHandler },
  });

  const directConversation = await fabric.invoke({
    callerNodeId: "pi-chat",
    provide: "chat_child",
    target: { nodeId: "child-node" },
    input: { message: "start" },
  });
  assert.equal(directConversation.ok, true);
  const openConversationMessage = runtime.getMessages().at(-1);
  assert.equal(openConversationMessage?.customType, "protocol-conversation");
  assert.ok(openConversationMessage?.content.includes("Talking to: child"));

  const routedTurn = await runtime.runInput("close");
  assert.deepEqual(routedTurn, { action: "handled" });
  const closeResultMessage = findLastMessage(runtime.getMessages(), "protocol-invoke-result");
  assert.ok(closeResultMessage?.content.includes("Child closed."));
  const closedConversationMessage = findLastMessage(runtime.getMessages(), "protocol-conversation");
  assert.ok(closedConversationMessage?.content.includes("Talking to: main agent"));

  await fabric.invoke({
    callerNodeId: "pi-chat",
    provide: "chat_child",
    target: { nodeId: "child-node" },
    input: { message: "start-again" },
  });
  const cancelled = await runtime.runInput("/cancel-handoff");
  assert.deepEqual(cancelled, { action: "handled" });
  const postCancelMain = findLastMessage(runtime.getMessages(), "protocol-conversation");
  assert.ok(postCancelMain?.content.includes("Talking to: main agent"));
  const afterCancel = await runtime.runInput("hello main");
  assert.deepEqual(afterCancel, { action: "continue" });

  await fabric.invoke({
    callerNodeId: "pi-chat",
    provide: "chat_parent",
    target: { nodeId: "parent-node" },
    input: { message: "start-parent" },
  });
  await fabric.invoke({
    callerNodeId: "parent-node",
    provide: "chat_child",
    target: { nodeId: "child-node" },
    input: { message: "nested-start" },
  });
  const nestedConversationMessage = findLastMessage(runtime.getMessages(), "protocol-conversation");
  const nestedDetails = nestedConversationMessage?.details as { breadcrumb?: string[]; ownerLabel?: string } | undefined;
  assert.deepEqual(nestedDetails?.breadcrumb, ["main", "parent", "child"]);
  assert.equal(nestedDetails?.ownerLabel, "child");

  await fabric.invoke({
    callerNodeId: "parent-node",
    provide: "chat_child",
    target: { nodeId: "child-node" },
    input: { message: "close", conversationToken: "child-1" },
  });
  const poppedConversationMessage = findLastMessage(runtime.getMessages(), "protocol-conversation");
  const poppedDetails = poppedConversationMessage?.details as { breadcrumb?: string[]; ownerLabel?: string } | undefined;
  assert.deepEqual(poppedDetails?.breadcrumb, ["main", "parent"]);
  assert.equal(poppedDetails?.ownerLabel, "parent");

  await fabric.invoke({
    callerNodeId: "parent-node",
    provide: "chat_child",
    target: { nodeId: "child-node" },
    input: { message: "return" },
  });
  const returnedConversationMessage = findLastMessage(runtime.getMessages(), "protocol-conversation");
  const returnedDetails = returnedConversationMessage?.details as { breadcrumb?: string[]; ownerLabel?: string } | undefined;
  assert.deepEqual(returnedDetails?.breadcrumb, ["main", "parent"]);
  assert.equal(returnedDetails?.ownerLabel, "parent");

  const parentRoutedTurn = await runtime.runInput("parent follow-up");
  assert.deepEqual(parentRoutedTurn, { action: "handled" });
  const parentResultMessage = findLastMessage(runtime.getMessages(), "protocol-invoke-result");
  const parentResultDetails = parentResultMessage?.details as { nodeId?: string; provide?: string } | undefined;
  assert.equal(parentResultDetails?.nodeId, "parent-node");
  assert.equal(parentResultDetails?.provide, "chat_parent");
  assert.deepEqual(parentInvocationLog.at(-1), { message: "parent follow-up", conversationToken: "parent-1" });

  console.log("protocol conversation routing passed");
  resetProtocolGlobals();
}

main().catch((error: unknown) => {
  console.error(error);
  resetProtocolGlobals();
  process.exitCode = 1;
});
