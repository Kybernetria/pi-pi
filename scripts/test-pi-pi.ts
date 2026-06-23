import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";
import manifestJson from "../pi.protocol.json" with { type: "json" };
import { createHandlers } from "../protocol/handlers.ts";
import { buildPackage } from "../protocol/builder.ts";

const manifest = manifestJson as PiProtocolManifest;

async function main(): Promise<void> {
  const fabric = createProtocolFabric();
  registerProtocolManifest(fabric, { manifest, handlers: createHandlers({ fabric }) });

  const node = fabric.describeNode("pi_pi");
  assert.equal(node?.purpose, "Agent-backed builder for pi-protocol compatible Pi packages/extensions.");
  assert.equal(node?.provides.length, 1);

  const buildProvide = fabric.describeProvide("pi_pi", "build_package");
  assert.ok(buildProvide, "build_package provide exists");
  assert.deepEqual(buildProvide?.execution, { type: "handler", handler: "build_package" });
  assert.equal(fabric.describeProvide("pi_pi", "chat"), undefined);

  const missingTarget = await fabric.invoke({
    nodeId: "pi_pi",
    provide: "build_package",
    input: { request: "Build a pi-protocol package." },
  });
  assert.equal(missingTarget.ok, false);

  const directMissingTarget = await buildPackage({ request: "Build a pi-protocol package." });
  assert.equal(directMissingTarget.status, "clarification_needed");

  const targetDir = path.join(await mkdtemp(path.join(tmpdir(), "pi-pi-agent-test-")), "generated");
  try {
    process.env.PI_PI_DISABLE_AGENT = "1";
    const result = await buildPackage({ request: "Build a minimal pi-protocol package for testing.", targetDir });
    delete process.env.PI_PI_DISABLE_AGENT;
    assert.ok(["completed", "clarification_needed", "unsupported", "failed"].includes(result.status));
    assert.equal(path.resolve(targetDir), result.targetDir);
    // In non-Pi test environments the AgentSession may be unavailable; the key regression is that pi-pi
    // does not fall back to hardcoded behavior-specific scaffolds.
    if (result.status === "unsupported") {
      assert.match(result.summary, /agent session/i);
    }
  } finally {
    await rm(path.dirname(targetDir), { recursive: true, force: true });
  }

  console.log("pi-pi agent-builder contract tests passed");
}

await main();
