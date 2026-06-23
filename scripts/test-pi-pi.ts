import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";
import manifestJson from "../pi.protocol.json" with { type: "json" };
import { createProtocolBuilderAgentExecutor } from "../protocol/agent-builder.ts";

const manifest = manifestJson as PiProtocolManifest;

async function main(): Promise<void> {
  const fabric = createProtocolFabric();
  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: { protocol_builder: createProtocolBuilderAgentExecutor() },
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

  const targetDir = path.join(await mkdtemp(path.join(tmpdir(), "pi-pi-agent-test-")), "generated");
  try {
    process.env.PI_PI_DISABLE_AGENT = "1";
    const result = await fabric.invoke({
      nodeId: "pi_pi",
      provide: "build_package",
      input: { request: "Build a minimal pi-protocol package for testing.", targetDir },
    });
    delete process.env.PI_PI_DISABLE_AGENT;
    assert.equal(result.ok, true);
    if (result.ok) {
      const output = result.output as { status: string; targetDir?: string; summary: string };
      assert.equal(output.status, "unsupported");
      assert.equal(path.resolve(targetDir), output.targetDir);
      assert.match(output.summary, /agent session/i);
    }
  } finally {
    delete process.env.PI_PI_DISABLE_AGENT;
    await rm(path.dirname(targetDir), { recursive: true, force: true });
  }

  console.log("pi-pi direct agent provide tests passed");
}

await main();
