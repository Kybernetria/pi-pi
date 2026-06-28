import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProtocolFabric, registerProtocolManifest, type PiProtocolManifest, type ProtocolRuntimeEvent } from "@kybernetria/pi-protocol";
import type { PiSdkAgentSessionLike, PiSdkAgentSessionEventLike } from "@kybernetria/pi-protocol/sdk";
import manifestJson from "../pi.protocol.json" with { type: "json" };
import { createProtocolBuilderAgentExecutor } from "../protocol/agent-builder.ts";

const manifest = manifestJson as PiProtocolManifest;

async function main(): Promise<void> {
  const runtimeEvents: ProtocolRuntimeEvent[] = [];
  const prompts: string[] = [];
  const fabric = createProtocolFabric();
  fabric.subscribeRuntimeEventRecorder((event) => {
    runtimeEvents.push(event);
  });

  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: {
      protocol_builder: createProtocolBuilderAgentExecutor({
        createSession: () => createFakeSession(prompts),
      }),
    },
  });

  const node = fabric.describeNode("pi_pi");
  assert.equal(node?.purpose, "Protocol-invoked agent builder for pi-protocol compatible Pi packages/extensions.");
  assert.equal(node?.provides.length, 1);
  assert.ok(node?.agents?.protocol_builder);

  const buildProvide = fabric.describeProvide("pi_pi", "build_package");
  assert.ok(buildProvide, "build_package provide exists");
  assert.deepEqual(buildProvide?.execution, { type: "agent", agent: "protocol_builder" });
  assert.equal(fabric.describeProvide("pi_pi", "chat"), undefined);

  const missingTarget = await fabric.invoke({
    nodeId: "pi_pi",
    provide: "build_package",
    input: { request: "Build a pi-protocol package." },
  });
  assert.equal(missingTarget.ok, false);
  assert.equal(missingTarget.ok ? undefined : missingTarget.error.code, "INVALID_INPUT");

  const targetDir = path.join(await mkdtemp(path.join(tmpdir(), "pi-pi-agent-test-")), "generated");
  try {
    const result = await fabric.invoke({
      nodeId: "pi_pi",
      provide: "build_package",
      input: { request: "Build a minimal pi-protocol package for testing.", targetDir },
      traceId: "trace-test",
      spanId: "span-test",
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      const output = result.output as { status: string; targetDir?: string; summary: string; filesWritten?: string[] };
      assert.equal(output.status, "completed");
      assert.equal(path.resolve(targetDir), output.targetDir);
      assert.match(output.summary, /fake sdk agent/i);
      assert.deepEqual(output.filesWritten, ["package.json"]);
    }

    assert.equal(prompts.length, 1);
    assert.match(prompts[0] ?? "", /Target directory:/);
    assert.match(prompts[0] ?? "", /Build a minimal pi-protocol package/);
    assert.ok(runtimeEvents.some((event) => event.type === "executor_input_snapshot" && event.traceId === "trace-test"));
    assert.ok(runtimeEvents.some((event) => event.type === "executor_output_delta" && event.spanId === "span-test"));
    assert.ok(runtimeEvents.some((event) => event.type === "executor_output_snapshot"));
  } finally {
    await rm(path.dirname(targetDir), { recursive: true, force: true });
  }

  console.log("pi-pi clean SDK agent provide tests passed");
}

function createFakeSession(prompts: string[]): PiSdkAgentSessionLike {
  const listeners = new Set<(event: PiSdkAgentSessionEventLike) => void>();
  return {
    async prompt(text: string): Promise<void> {
      prompts.push(text);
      const output = JSON.stringify({
        status: "completed",
        summary: "fake SDK agent completed through direct protocol agent invocation",
        targetDir: path.resolve(text.match(/Target directory: (.*)/)?.[1]?.trim() ?? "."),
        filesWritten: ["package.json"],
      });
      for (const chunk of [output.slice(0, 24), output.slice(24)]) {
        for (const listener of listeners) {
          listener({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: chunk } });
        }
      }
    },
    subscribe(listener: (event: PiSdkAgentSessionEventLike) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose(): void {
      listeners.clear();
    },
  };
}

await main();
