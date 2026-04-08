import assert from "node:assert/strict";
import {
  FABRIC_KEY,
  PROTOCOL_AGENT_PROJECTION_KEY,
  PROTOCOL_PROMPT_AWARENESS_KEY,
  createProtocolFabric,
  registerProtocolNode,
  type ProtocolHandler,
  type ProtocolInvokeResult,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";

interface Entry {
  kind: string;
  data: unknown;
}

interface CustomMessage {
  customType: string;
  content: string;
  display: boolean;
  details?: unknown;
}

function resetProtocolGlobals(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_AGENT_PROJECTION_KEY];
  delete (globalThis as Record<PropertyKey, unknown>)[PROTOCOL_PROMPT_AWARENESS_KEY];
}

function createPi(entries: Entry[], messages: CustomMessage[]): ProtocolSessionPi {
  return {
    appendEntry(kind: string, data: unknown) {
      entries.push({ kind, data });
    },
    sendMessage(message: unknown) {
      messages.push(message as CustomMessage);
    },
  };
}

const echo_task: ProtocolHandler<{ task: string }, { result: string }> = async (_ctx, input) => ({
  result: `echo:${input.task}`,
});

const orchestrate_task: ProtocolHandler<
  { task: string },
  { result: string; budgetBound: boolean; depth: number }
> = async (ctx, input) => {
  return ctx.handoff.run(
    async (handoffCtx) => {
      handoffCtx.record("internal-note", { secret: `plan:${input.task}` });
      const nested = await handoffCtx.delegate.invoke<{ task: string }, { result: string }>({
        provide: "echo_task",
        target: { nodeId: "worker-node" },
        input,
      });

      assert.equal(handoffCtx.maxDepth, ctx.maxDepth);
      assert.ok(typeof handoffCtx.budget?.deadlineMs === "number");

      if (!nested.ok) {
        throw new Error(nested.error.message);
      }

      return {
        result: nested.output.result,
        budgetBound: typeof handoffCtx.budget?.deadlineMs === "number",
        depth: handoffCtx.depth,
      };
    },
    {
      brief: `handoff:${input.task}`,
    },
  );
};

async function invokeTyped<TOutput>(
  fabric: { invoke: (request: Parameters<ReturnType<typeof createProtocolFabric>["invoke"]>[0]) => Promise<ProtocolInvokeResult> },
  request: Parameters<ReturnType<typeof createProtocolFabric>["invoke"]>[0],
): Promise<ProtocolInvokeResult<TOutput>> {
  return (await fabric.invoke(request)) as ProtocolInvokeResult<TOutput>;
}

async function main(): Promise<void> {
  resetProtocolGlobals();

  const entries: Entry[] = [];
  const messages: CustomMessage[] = [];
  const pi = createPi(entries, messages);
  const fabric = createProtocolFabric(pi);

  registerProtocolNode(pi, fabric, {
    manifest: {
      protocolVersion: "0.1.0",
      nodeId: "worker-node",
      purpose: "Worker fixture",
      provides: [
        {
          name: "echo_task",
          description: "Echo a task.",
          handler: "echo_task",
          inputSchema: {
            type: "object",
            required: ["task"],
            properties: {
              task: { type: "string" },
            },
          },
          outputSchema: {
            type: "object",
            required: ["result"],
            properties: {
              result: { type: "string" },
            },
          },
        },
      ],
    },
    handlers: { echo_task: echo_task as ProtocolHandler },
  });

  registerProtocolNode(pi, fabric, {
    manifest: {
      protocolVersion: "0.1.0",
      nodeId: "builder-node",
      purpose: "Builder fixture",
      provides: [
        {
          name: "orchestrate_task",
          description: "Run a node-local handoff and delegate to a worker.",
          handler: "orchestrate_task",
          inputSchema: {
            type: "object",
            required: ["task"],
            properties: {
              task: { type: "string" },
            },
          },
          outputSchema: {
            type: "object",
            required: ["result", "budgetBound", "depth"],
            properties: {
              result: { type: "string" },
              budgetBound: { type: "boolean" },
              depth: { type: "integer" },
            },
          },
        },
      ],
    },
    handlers: { orchestrate_task: orchestrate_task as ProtocolHandler },
  });

  const opaqueResult = await invokeTyped<{ result: string; budgetBound: boolean; depth: number }>(fabric, {
    callerNodeId: "pi-chat",
    provide: "orchestrate_task",
    target: { nodeId: "builder-node" },
    input: { task: "alpha" },
    budget: { remainingTokens: 50 },
  });

  if (!opaqueResult.ok) throw new Error(opaqueResult.error.message);
  assert.equal(opaqueResult.ok, true);
  assert.deepEqual(Object.keys(opaqueResult.output).sort(), ["budgetBound", "depth", "result"]);
  assert.equal(opaqueResult.output.result, "echo:alpha");
  assert.equal(opaqueResult.output.budgetBound, true);

  const opaqueHandoffIndicator = entries
    .map((entry) => entry.data as { kind?: string; label?: string; status?: string; collapsed?: boolean })
    .find((entry) => entry.kind === "handoff_indicator" && entry.status === "done");
  assert.equal(opaqueHandoffIndicator?.label, "handoff: builder-node.orchestrate_task");
  assert.equal(opaqueHandoffIndicator?.collapsed, true);

  const opaqueHandoffEvent = entries
    .map((entry) => entry.data as { kind?: string; eventKind?: string; data?: unknown })
    .find((entry) => entry.kind === "handoff_event" && entry.eventKind === "internal-note");
  assert.deepEqual(opaqueHandoffEvent?.data, { redacted: true });

  const visibleResult = await invokeTyped<{ result: string; budgetBound: boolean; depth: number }>(fabric, {
    callerNodeId: "pi-chat",
    provide: "orchestrate_task",
    target: { nodeId: "builder-node" },
    input: { task: "beta" },
    handoff: { opaque: false, brief: "show internal notes locally" },
  });

  if (!visibleResult.ok) throw new Error(visibleResult.error.message);
  assert.equal(visibleResult.ok, true);
  assert.equal(visibleResult.output.result, "echo:beta");
  assert.deepEqual(Object.keys(visibleResult.output).sort(), ["budgetBound", "depth", "result"]);

  const visibleHandoffIndicator = entries
    .map((entry) => entry.data as { kind?: string; label?: string; status?: string; collapsed?: boolean })
    .reverse()
    .find((entry) => entry.kind === "handoff_indicator" && entry.status === "done");
  assert.equal(visibleHandoffIndicator?.label, "handoff: builder-node.orchestrate_task");
  assert.equal(visibleHandoffIndicator?.collapsed, true);

  const visibleHandoffEvent = entries
    .map((entry) => entry.data as { kind?: string; eventKind?: string; data?: unknown })
    .reverse()
    .find((entry) => entry.kind === "handoff_event" && entry.eventKind === "internal-note");
  assert.deepEqual(visibleHandoffEvent?.data, { secret: "plan:beta" });

  const visibleHandoffDetail = entries
    .map((entry) => entry.data as { kind?: string; eventKind?: string; data?: unknown })
    .reverse()
    .find((entry) => entry.kind === "handoff_detail" && entry.eventKind === "internal-note");
  assert.deepEqual(visibleHandoffDetail?.data, { secret: "plan:beta" });

  const protocolHandoffMessage = messages.reverse().find((message) => message.customType === "protocol-handoff");
  assert.ok(protocolHandoffMessage, "handoff should emit a normal-session custom message");
  assert.equal(protocolHandoffMessage?.display, true);
  assert.ok(protocolHandoffMessage?.content.includes("handoff: builder-node.orchestrate_task"));
  const protocolHandoffDetails = protocolHandoffMessage?.details as {
    status?: string;
    events?: Array<{ eventKind?: string; data?: unknown }>;
  };
  assert.equal(protocolHandoffDetails?.status, "done");
  assert.ok(protocolHandoffDetails?.events?.some((event) => event.eventKind === "internal-note"));

  console.log("node-local handoff runtime passed");
  resetProtocolGlobals();
}

main().catch((error: unknown) => {
  console.error(error);
  resetProtocolGlobals();
  process.exitCode = 1;
});
