import assert from "node:assert/strict";
import { chatPiPi } from "../protocol/chat.ts";
import { __resetChatPiPiConversationStoreForTests } from "../protocol/chat-orchestrator.ts";
import {
  applyProtocolChildSessionRuntime,
  createProtocolChildSessionRuntime,
} from "../extensions/protocol-child-session.ts";

interface FakeAgentMessage {
  role: "assistant";
  content: Array<{ type: "text"; text: string }>;
}

interface FakeSession {
  messages: FakeAgentMessage[];
  prompt: (prompt: string, options?: unknown) => Promise<void>;
  dispose: () => void;
  bindExtensions: (_bindings: unknown) => Promise<void>;
  getAllTools: () => Array<{ name: string }>;
  setActiveToolsByName: (toolNames: string[]) => void;
}

interface FakeBridgePi {
  on: (event: string, handler: (payload: any) => Promise<void> | void) => void;
  emit: (event: string, payload: any) => Promise<void>;
}

function createFakeBridgePi(): FakeBridgePi {
  const listeners = new Map<string, Array<(payload: any) => Promise<void> | void>>();
  return {
    on(event, handler) {
      const current = listeners.get(event) ?? [];
      current.push(handler);
      listeners.set(event, current);
    },
    async emit(event, payload) {
      for (const handler of listeners.get(event) ?? []) {
        await handler(payload);
      }
    },
  };
}

async function main(): Promise<void> {
  __resetChatPiPiConversationStoreForTests();

  const emittedEntries: Array<{ kind: string; data: unknown }> = [];
  const emittedMessages: Array<{ customType?: string; content?: string; details?: unknown }> = [];

  let createCount = 0;
  let disposeCount = 0;
  let bindExtensionsCount = 0;
  let childToolNames: string[] = [];
  let lastCreateOptions: Record<string, unknown> | undefined;
  const promptHistory: string[] = [];
  const queuedOutputs = [
    JSON.stringify({
      status: "clarification_needed",
      reply: "What kind of release notes package do you want?",
      questions: ["Should it summarize markdown changelogs, release tags, or both?"],
    }),
    JSON.stringify({
      status: "completed",
      reply: "Done building the release-notes package.",
    }),
  ];

  const fakeCreateAgentSession = async (options?: Record<string, unknown>) => {
    createCount += 1;
    lastCreateOptions = options;
    const session: FakeSession = {
      messages: [],
      async prompt(prompt) {
        promptHistory.push(prompt);
        const next = queuedOutputs.shift();
        if (!next) {
          throw new Error("no queued fake output available");
        }
        session.messages.push({
          role: "assistant",
          content: [{ type: "text", text: next }],
        });
      },
      dispose() {
        disposeCount += 1;
      },
      async bindExtensions() {
        bindExtensionsCount += 1;
      },
      getAllTools() {
        return [
          { name: "read" },
          { name: "write" },
          { name: "edit" },
          { name: "bash" },
          { name: "protocol" },
          { name: "inspect_build_target" },
          { name: "execute_certified_build" },
        ];
      },
      setActiveToolsByName(toolNames) {
        childToolNames = [...toolNames];
      },
    };

    return { session };
  };

  const runtimeHints = {
    createAgentSession: fakeCreateAgentSession,
    protocolSessionPi: {
      appendEntry(kind: string, data: unknown) {
        emittedEntries.push({ kind, data });
      },
      sendMessage(message: unknown) {
        emittedMessages.push(message as { customType?: string; content?: string; details?: unknown });
      },
      getActiveTools() {
        return ["read", "write", "edit", "bash", "protocol"];
      },
      getAllTools() {
        return [
          { name: "read" },
          { name: "write" },
          { name: "edit" },
          { name: "bash" },
          { name: "protocol" },
        ];
      },
    },
  };

  const firstTurn = await chatPiPi(
    {
      message: "Build a package that helps summarize release notes.",
    },
    runtimeHints,
  );
  assert.equal(firstTurn.status, "clarification_needed");
  assert.equal(firstTurn.continuation?.state, "awaiting_user");
  assert.ok(firstTurn.continuation?.token);
  assert.equal(createCount, 1, "first delegated turn should create one child session");
  assert.equal(bindExtensionsCount, 1, "child delegated session should bind inline runtime hooks once");
  assert.equal(disposeCount, 0, "open delegated conversation should keep the child session alive");
  assert.ok(Array.isArray(lastCreateOptions?.customTools), "child delegated session should receive custom tools");
  assert.deepEqual(
    childToolNames.sort(),
    ["bash", "edit", "execute_certified_build", "inspect_build_target", "protocol", "read", "write"].sort(),
    "child delegated session should inherit core tools plus protocol by default",
  );

  const secondTurn = await chatPiPi(
    {
      message: "It should summarize markdown changelogs and release tags.",
      conversationToken: firstTurn.continuation?.token,
    },
    runtimeHints,
  );
  assert.equal(secondTurn.status, "completed");
  assert.equal(secondTurn.continuation?.state, "closed");
  assert.equal(secondTurn.continuation?.token, firstTurn.continuation?.token);
  assert.equal(createCount, 1, "follow-up turn should resume the same child session");
  assert.equal(disposeCount, 1, "closed delegated conversation should dispose the child session");
  assert.equal(promptHistory.length, 2, "same child session should receive both prompts");
  assert.ok(promptHistory[1]?.includes(`conversationToken=${JSON.stringify(firstTurn.continuation?.token)}`));
  const statusMessages = emittedMessages.filter((message) => message.customType === "protocol-subagent-status");
  assert.ok(statusMessages.length > 0, "delegated child work should emit visible structured status messages");
  assert.ok(
    statusMessages.every((message) => !String(message.content ?? "").includes("What kind of release notes package do you want?")),
    "status messages should not restate the child reply",
  );
  assert.ok(
    emittedEntries.some((entry) => entry.kind === "protocol" && (entry.data as { kind?: string }).kind === "subagent_started"),
    "delegated child work should emit a distinct structured started entry",
  );
  assert.ok(
    emittedEntries.some((entry) => entry.kind === "protocol" && (entry.data as { kind?: string }).kind === "subagent_status"),
    "delegated child work should emit structured harness status entries",
  );
  assert.equal(
    emittedMessages.filter((message) => message.customType === "protocol-subagent-stream").length,
    0,
    "final child answer should not be duplicated into a stream message when invoke result will carry it",
  );
  assert.equal(
    emittedEntries.filter((entry) => entry.kind === "protocol" && (entry.data as { kind?: string }).kind === "subagent_started").length,
    1,
    "resumed delegated turns should not duplicate subagent_started lifecycle emission",
  );

  const conversationalMessages: Array<{ customType?: string; content?: string; details?: unknown }> = [];
  const conversationalOutputs = [
    JSON.stringify({
      status: "completed",
      reply: "Hello from pi-pi. What detail should I ask for next?",
    }),
    JSON.stringify({
      status: "completed",
      reply: "Thanks — that confirms the follow-up path works.",
    }),
  ];
  const imperativeOutputs = [
    JSON.stringify({
      status: "completed",
      reply: "Next, send me one short in-scope prompt so I can continue the loop.",
    }),
  ];
  const conversationalCreateAgentSession = async () => {
    const session: FakeSession = {
      messages: [],
      async prompt() {
        const next = conversationalOutputs.shift();
        if (!next) {
          throw new Error("no queued conversational output available");
        }
        session.messages.push({
          role: "assistant",
          content: [{ type: "text", text: next }],
        });
      },
      dispose() {
        // no-op for this fixture
      },
      async bindExtensions() {
        // no-op for this fixture
      },
      getAllTools() {
        return [
          { name: "read" },
          { name: "write" },
          { name: "edit" },
          { name: "bash" },
          { name: "protocol" },
          { name: "inspect_build_target" },
          { name: "execute_certified_build" },
        ];
      },
      setActiveToolsByName() {
        // no-op for this fixture
      },
    };

    return { session };
  };

  const conversationalFirstTurn = await chatPiPi(
    {
      message: "Say hello and ask me one follow-up question.",
    },
    {
      createAgentSession: conversationalCreateAgentSession,
      protocolSessionPi: {
        appendEntry() {
          // no-op
        },
        sendMessage(message: unknown) {
          conversationalMessages.push(message as { customType?: string; content?: string; details?: unknown });
        },
        getActiveTools() {
          return ["read", "write", "edit", "bash", "protocol"];
        },
        getAllTools() {
          return [
            { name: "read" },
            { name: "write" },
            { name: "edit" },
            { name: "bash" },
            { name: "protocol" },
          ];
        },
      },
    },
  );
  assert.equal(conversationalFirstTurn.status, "completed");
  assert.equal(
    conversationalFirstTurn.continuation?.state,
    "awaiting_user",
    "completed conversational replies that ask the user a question should keep the delegated floor",
  );
  assert.ok(conversationalFirstTurn.continuation?.token);

  const conversationalSecondTurn = await chatPiPi(
    {
      message: "Ask for the repo path next.",
      conversationToken: conversationalFirstTurn.continuation?.token,
    },
    {
      createAgentSession: conversationalCreateAgentSession,
      protocolSessionPi: {
        appendEntry() {
          // no-op
        },
        sendMessage(message: unknown) {
          conversationalMessages.push(message as { customType?: string; content?: string; details?: unknown });
        },
        getActiveTools() {
          return ["read", "write", "edit", "bash", "protocol"];
        },
        getAllTools() {
          return [
            { name: "read" },
            { name: "write" },
            { name: "edit" },
            { name: "bash" },
            { name: "protocol" },
          ];
        },
      },
    },
  );
  assert.equal(conversationalSecondTurn.continuation?.state, "closed");
  assert.ok(
    conversationalMessages.some((message) => message.customType === "protocol-subagent-status"),
    "conversational delegated turns should still emit visible status messages while running",
  );

  const imperativeTurn = await chatPiPi(
    {
      message: "Keep the loop going without a literal question mark.",
    },
    {
      createAgentSession: async () => {
        const session: FakeSession = {
          messages: [],
          async prompt() {
            const next = imperativeOutputs.shift();
            if (!next) {
              throw new Error("no queued imperative output available");
            }
            session.messages.push({
              role: "assistant",
              content: [{ type: "text", text: next }],
            });
          },
          dispose() {
            // no-op for this fixture
          },
          async bindExtensions() {
            // no-op for this fixture
          },
          getAllTools() {
            return [
              { name: "read" },
              { name: "write" },
              { name: "edit" },
              { name: "bash" },
              { name: "protocol" },
              { name: "inspect_build_target" },
              { name: "execute_certified_build" },
            ];
          },
          setActiveToolsByName() {
            // no-op for this fixture
          },
        };

        return { session };
      },
      protocolSessionPi: {
        appendEntry() {
          // no-op
        },
        sendMessage() {
          // no-op
        },
        getActiveTools() {
          return ["read", "write", "edit", "bash", "protocol"];
        },
        getAllTools() {
          return [
            { name: "read" },
            { name: "write" },
            { name: "edit" },
            { name: "bash" },
            { name: "protocol" },
          ];
        },
      },
    },
  );
  assert.equal(
    imperativeTurn.continuation?.state,
    "awaiting_user",
    "instructional conversational replies should keep the delegated floor even without a trailing question mark",
  );

  const structuredBridgeEntries: Array<{ kind: string; data: unknown }> = [];
  const structuredBridgeMessages: Array<{ customType?: string; content?: string; details?: unknown }> = [];
  const structuredBridgeRuntime = createProtocolChildSessionRuntime({
    projection: {
      appendEntry(kind: string, data: unknown) {
        structuredBridgeEntries.push({ kind, data });
      },
      sendMessage(message: unknown) {
        structuredBridgeMessages.push(message as { customType?: string; content?: string; details?: unknown });
      },
    },
    traceId: "structured-trace",
    depth: 1,
    nodeId: "pi-pi",
    provide: "chat_pi_pi",
    assistantMessagePolicy: "final-only",
  });
  const structuredBridgePi = createFakeBridgePi();
  structuredBridgeRuntime.extensionFactories[0]?.(structuredBridgePi as any);
  structuredBridgeRuntime.beginRun({ traceId: "structured-run-trace", depth: 2 });
  await structuredBridgePi.emit("message_start", {
    message: {
      role: "assistant",
      timestamp: 1,
      content: [{ type: "text", text: "{" }],
    },
  });
  await structuredBridgePi.emit("message_update", {
    message: {
      role: "assistant",
      content: [{ type: "text", text: '{"status":"completed","reply":"Considering concise responses"}' }],
    },
  });
  await structuredBridgePi.emit("message_end", {
    message: {
      role: "assistant",
      content: [{ type: "text", text: '{"status":"completed","reply":"Finalizing response"}' }],
    },
  });
  assert.equal(
    structuredBridgeMessages.filter((message) => message.customType === "protocol-subagent-stream").length,
    0,
    "structured child-session JSON output should not surface raw assistant delta/completed stream spam",
  );
  assert.equal(
    structuredBridgeEntries.filter((entry) => entry.kind === "protocol" && (entry.data as { kind?: string }).kind === "subagent_message_delta").length,
    0,
    "structured child-session JSON output should not leak raw token fragments into harness entries",
  );

  const correlatedBridgeMessages: Array<{ customType?: string; content?: string; details?: unknown }> = [];
  const correlatedBridgeRuntime = createProtocolChildSessionRuntime({
    projection: {
      appendEntry() {
        // no-op
      },
      sendMessage(message: unknown) {
        correlatedBridgeMessages.push(message as { customType?: string; content?: string; details?: unknown });
      },
    },
    traceId: "correlation-trace-a",
    depth: 1,
    nodeId: "pi-pi",
    provide: "chat_pi_pi",
    assistantMessagePolicy: "stream",
  });
  const correlatedBridgePi = createFakeBridgePi();
  correlatedBridgeRuntime.extensionFactories[0]?.(correlatedBridgePi as any);
  const staleRunId = correlatedBridgeRuntime.beginRun({ traceId: "correlation-trace-a", depth: 2 });
  await correlatedBridgePi.emit("message_start", {
    message: {
      role: "assistant",
      timestamp: 10,
      content: [{ type: "text", text: "old" }],
    },
  });
  correlatedBridgeRuntime.beginRun({ traceId: "correlation-trace-b", depth: 2 });
  await correlatedBridgePi.emit("message_end", {
    message: {
      role: "assistant",
      content: [{ type: "text", text: "old response that should be ignored" }],
    },
  });
  await correlatedBridgePi.emit("message_start", {
    message: {
      role: "assistant",
      timestamp: 11,
      content: [{ type: "text", text: "fresh" }],
    },
  });
  await correlatedBridgePi.emit("message_update", {
    message: {
      role: "assistant",
      content: [{ type: "text", text: "fresh response for the current run." }],
    },
  });
  await correlatedBridgePi.emit("message_end", {
    message: {
      role: "assistant",
      content: [{ type: "text", text: "fresh response for the current run." }],
    },
  });
  const correlatedStreamMessages = correlatedBridgeMessages.filter((message) => message.customType === "protocol-subagent-stream");
  assert.ok(
    correlatedStreamMessages.every((message) => !(message.content ?? "").includes("old response that should be ignored")),
    "late stream events from an earlier delegated run should be dropped instead of surfacing as current output",
  );
  assert.ok(
    correlatedStreamMessages.some((message) => {
      const details = message.details as { runId?: string } | undefined;
      return typeof details?.runId === "string" && details.runId !== staleRunId;
    }),
    "current delegated run stream events should carry a fresh runtime-only run id",
  );

  await assert.rejects(
    async () => applyProtocolChildSessionRuntime({
      async bindExtensions() {
        // present but child runtime is still missing protocol
      },
      getAllTools() {
        return [
          { name: "read" },
          { name: "write" },
          { name: "edit" },
          { name: "bash" },
          { name: "inspect_build_target" },
          { name: "execute_certified_build" },
        ];
      },
      setActiveToolsByName() {
        // no-op
      },
    }, createProtocolChildSessionRuntime({
      projection: runtimeHints.protocolSessionPi,
      traceId: "guardrail-trace",
      depth: 1,
      nodeId: "pi-pi",
      provide: "chat_pi_pi",
      label: "pi-pi",
      extraToolNames: ["inspect_build_target", "execute_certified_build"],
      strict: true,
    })),
    /protocol_tool_unavailable/i,
    "strict child-session runtime should fail fast when protocol inheritance is expected but unavailable",
  );

  await assert.rejects(
    async () => applyProtocolChildSessionRuntime({
      async bindExtensions() {
        // present but the session is missing read
      },
      getAllTools() {
        return [
          { name: "write" },
          { name: "edit" },
          { name: "bash" },
          { name: "protocol" },
          { name: "inspect_build_target" },
          { name: "execute_certified_build" },
        ];
      },
      setActiveToolsByName() {
        // no-op
      },
    }, createProtocolChildSessionRuntime({
      projection: runtimeHints.protocolSessionPi,
      traceId: "guardrail-trace-2",
      depth: 1,
      nodeId: "pi-pi",
      provide: "chat_pi_pi",
      label: "pi-pi",
      extraToolNames: ["inspect_build_target", "execute_certified_build"],
      strict: true,
    })),
    /missing_required_tools/i,
    "strict child-session runtime should fail fast when required core tools are missing",
  );

  assert.throws(
    () => createProtocolChildSessionRuntime({
      traceId: "guardrail-trace-3",
      depth: 1,
      nodeId: "pi-pi",
      provide: "chat_pi_pi",
      visibility: { uiVisibility: "verbose" },
      strict: true,
    }),
    /projection when uiVisibility is verbose/i,
    "verbose child-session runtime should reject construction when no streaming projection is available",
  );

  console.log("chat_pi_pi continuation persistence passed");
  __resetChatPiPiConversationStoreForTests();
}

main().catch((error: unknown) => {
  console.error(error);
  __resetChatPiPiConversationStoreForTests();
  process.exitCode = 1;
});
