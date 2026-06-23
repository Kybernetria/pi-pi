import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  const buildProvide = fabric.describeProvide("pi_pi", "build_package");
  assert.ok(buildProvide, "build_package provide exists");
  assert.deepEqual(buildProvide?.execution, { type: "handler", handler: "build_package" });

  const explained = await fabric.invoke({
    nodeId: "pi_pi",
    provide: "build_package",
    input: { request: "Explain the required files for a pi-protocol package", mode: "explain" },
  });
  assert.equal(explained.ok, true);
  if (explained.ok) {
    const summary = String((explained.output as { summary: string }).summary);
    for (const expected of ["package.json", "pi.protocol.json", "extension.ts", "protocol/handlers.ts"]) {
      assert.match(summary, new RegExp(expected.replace(".", "\\.")));
    }
  }

  const root = await mkdtemp(path.join(tmpdir(), "pi-pi-test-"));
  try {
    await testLightningGeneration(path.join(root, "lightning"));
    await testMarkdownSummarizerGeneration(path.join(root, "markdown"));
    await testHonestyUnsupported();
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  console.log("pi-pi acceptance tests passed");
}

async function testLightningGeneration(targetDir: string): Promise<void> {
  const generated = await buildPackage({
    request: "Build a Pi extension that flashes lightning in the terminal when an agent request completes and exposes a protocol flash provide.",
    mode: "new",
    targetDir,
    applyChanges: true,
  });
  assert.equal(generated.status, "completed", generated.diagnostics?.join("\n"));
  assert.ok(generated.filesWritten?.includes("extension.ts"));
  const all = await readGenerated(targetDir);
  assert.match(all, /agent_end/);
  assert.match(all, /lightning/i);
  assert.match(all, /"name": "flash"|provide: "flash"/);
  assert.doesNotMatch(all, /Handled request|Handled:/);
  const validation = await validateProtocolPackage(targetDir);
  assert.equal(validation.pass, true, validation.issues.map((issue) => `${issue.rule}: ${issue.message}`).join("\n"));
}

async function testMarkdownSummarizerGeneration(targetDir: string): Promise<void> {
  const generated = await buildPackage({
    request: "Build me a protocol package that exposes a handler provide for summarizing markdown files.",
    mode: "new",
    targetDir,
    applyChanges: true,
  });
  assert.equal(generated.status, "completed", generated.diagnostics?.join("\n"));
  const all = await readGenerated(targetDir);
  assert.match(all, /summarize_markdown|summarize/i);
  assert.match(all, /readFile|filePath|markdown/i);
  assert.doesNotMatch(all, /"name": "run"|Handled request|Handled:/);
  const validation = await validateProtocolPackage(targetDir);
  assert.equal(validation.pass, true, validation.issues.map((issue) => `${issue.rule}: ${issue.message}`).join("\n"));
}

async function testHonestyUnsupported(): Promise<void> {
  const result = await buildPackage({
    request: "Build a package that controls an interplanetary coffee roaster with quantum telemetry and invent all hardware drivers.",
    mode: "new",
    applyChanges: false,
  });
  assert.ok(result.status === "unsupported" || result.status === "clarification_needed");
  assert.notEqual(result.status, "completed");
}

async function readGenerated(targetDir: string): Promise<string> {
  const files = ["package.json", "pi.protocol.json", "extension.ts", "protocol/handlers.ts", "README.md"];
  const chunks = await Promise.all(files.map(async (file) => readFile(path.join(targetDir, file), "utf8").catch(() => "")));
  return chunks.join("\n---FILE---\n");
}

await main();
