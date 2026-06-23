import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";
import manifestJson from "../pi.protocol.json" with { type: "json" };
import { createHandlers } from "../protocol/handlers.ts";
import { buildPackage } from "../protocol/builder.ts";
import { validateProtocolPackage } from "../protocol/validation.ts";

const manifest = manifestJson as PiProtocolManifest;

async function main(): Promise<void> {
  const fabric = createProtocolFabric();
  registerProtocolManifest(fabric, { manifest, handlers: createHandlers({ fabric }) });

  const node = fabric.describeNode("pi_pi");
  assert.equal(node?.purpose, "Build, adapt, and repair pi-protocol compatible Pi packages/extensions.");
  assert.ok(fabric.describeProvide("pi_pi", "build_package"));

  const invoked = await fabric.invoke({
    nodeId: "pi_pi",
    provide: "build_package",
    input: { request: "Explain the required files for a pi-protocol package", mode: "explain" },
  });
  assert.equal(invoked.ok, true);
  if (invoked.ok) assert.match(String((invoked.output as { summary: string }).summary), /pi\.protocol\.json/);

  const targetDir = path.join(await mkdtemp(path.join(tmpdir(), "pi-pi-test-")), "generated");
  const generated = await buildPackage({
    request: "Build me a protocol package that exposes a handler provide for summarizing markdown files.",
    mode: "new",
    targetDir,
    applyChanges: true,
  });
  assert.equal(generated.status, "completed");
  assert.ok(generated.filesWritten?.includes("pi.protocol.json"));

  const validation = await validateProtocolPackage(targetDir);
  assert.equal(validation.pass, true, validation.issues.map((issue) => `${issue.rule}: ${issue.message}`).join("\n"));

  await rm(path.dirname(targetDir), { recursive: true, force: true });
  console.log("pi-pi manifest registration and validator tests passed");
}

await main();
