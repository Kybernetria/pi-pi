import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProtocolFabric, registerProtocolManifest, type PiProtocolManifest, type ProtocolRuntimeEvent } from "@kybernetria/pi-protocol";
import type { PiSdkAgentSessionLike, PiSdkAgentSessionEventLike } from "@kybernetria/pi-protocol/sdk";
import manifestJson from "../pi.protocol.json" with { type: "json" };
import { createProtocolBuilderAgentExecutor } from "../protocol/agent-builder.ts";
import { validateProtocolPackage } from "../protocol/validation.ts";

const manifest = manifestJson as PiProtocolManifest;

async function main(): Promise<void> {
  await testAgentProvideRegistration();
  await testAgentProvideInvalidInput();
  await testAgentProvideFullInvocation();
  await testTraceAndEventPropagation();
  await testValidation();
  console.log("pi-pi clean SDK agent provide tests passed");
}

async function testAgentProvideRegistration(): Promise<void> {
  const fabric = createProtocolFabric();
  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: {
      protocol_builder: createProtocolBuilderAgentExecutor({
        createSession: () => createFakeSession([]),
      }),
    },
  });

  const node = fabric.describeNode("pi_pi");
  assert.equal(node?.purpose, "Protocol-invoked agent builder for pi-protocol compatible Pi packages/extensions.");
  assert.equal(node?.provides.length, 1);
  assert.ok(node?.agents?.protocol_builder);
  assert.equal(node?.agents?.protocol_builder.systemPrompt?.mode, "append");

  const buildProvide = fabric.describeProvide("pi_pi", "build_package");
  assert.ok(buildProvide, "build_package provide exists");
  assert.deepEqual(buildProvide?.execution, { type: "agent", agent: "protocol_builder" });
  assert.equal(fabric.describeProvide("pi_pi", "chat"), undefined);

  console.log("  ✓ Agent provide registration and description");
}

async function testAgentProvideInvalidInput(): Promise<void> {
  const prompts: string[] = [];
  const fabric = createProtocolFabric();
  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: {
      protocol_builder: createProtocolBuilderAgentExecutor({
        createSession: () => createFakeSession(prompts),
      }),
    },
  });

  // Missing targetDir
  const missingTarget = await fabric.invoke({
    nodeId: "pi_pi",
    provide: "build_package",
    input: { request: "Build a pi-protocol package." },
  });
  assert.equal(missingTarget.ok, false);
  assert.equal(missingTarget.ok ? undefined : missingTarget.error.code, "INVALID_INPUT");

  // Missing both
  const missingBoth = await fabric.invoke({
    nodeId: "pi_pi",
    provide: "build_package",
    input: {},
  });
  assert.equal(missingBoth.ok, false);
  assert.equal(missingBoth.ok ? undefined : missingBoth.error.code, "INVALID_INPUT");

  // Non-existent provide
  const badProvide = await fabric.invoke({
    nodeId: "pi_pi",
    provide: "chat",
    input: { request: "hello", targetDir: "/tmp" },
  });
  assert.equal(badProvide.ok, false);

  console.log("  ✓ Invalid input handling");
}

async function testAgentProvideFullInvocation(): Promise<void> {
  const prompts: string[] = [];
  const targetDir = path.join(await mkdtemp(path.join(tmpdir(), "pi-pi-agent-test-")), "generated");
  const fabric = createProtocolFabric();
  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: {
      protocol_builder: createProtocolBuilderAgentExecutor({
        createSession: () => createFakeSession(prompts),
      }),
    },
  });

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
  } finally {
    await rm(path.dirname(targetDir), { recursive: true, force: true });
  }

  console.log("  ✓ Full invocation with SDK agent session");
}

async function testTraceAndEventPropagation(): Promise<void> {
  const prompts: string[] = [];
  const targetDir = path.join(await mkdtemp(path.join(tmpdir(), "pi-pi-trace-test-")), "generated");
  const fabric = createProtocolFabric();
  const events: ProtocolRuntimeEvent[] = [];
  fabric.subscribeRuntimeEventRecorder((event) => {
    events.push(event);
  });

  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: {
      protocol_builder: createProtocolBuilderAgentExecutor({
        createSession: () => createFakeSession(prompts),
      }),
    },
  });

  try {
    const result = await fabric.invoke({
      nodeId: "pi_pi",
      provide: "build_package",
      input: { request: "Build a package.", targetDir },
      traceId: "trace-test-2",
      spanId: "span-test-2",
      parentSpanId: "parent-span",
      callerNodeId: "test_agent.invoke",
    });

    assert.equal(result.ok, true);

    // Check runtime events
    const inputEvents = events.filter((e) => e.type === "executor_input_snapshot" && e.traceId === "trace-test-2");
    assert.ok(inputEvents.length >= 1, "should have at least one input snapshot event");

    const deltaEvents = events.filter((e) => e.type === "executor_output_delta" && e.spanId === "span-test-2");
    assert.ok(deltaEvents.length >= 1, "should have at least one output delta event");

    const outputEvents = events.filter((e) => e.type === "executor_output_snapshot");
    assert.ok(outputEvents.length >= 1, "should have at least one output snapshot event");
  } finally {
    await rm(path.dirname(targetDir), { recursive: true, force: true });
  }

  console.log("  ✓ Trace and event propagation");
}

async function testValidation(): Promise<void> {
  // Create a directory with a valid pi-protocol package
  const testDir = await mkdtemp(path.join(tmpdir(), "pi-pi-validation-test-"));
  try {
    // Create a valid package
    await writeFile(path.join(testDir, "package.json"), JSON.stringify({
      name: "test-package",
      version: "1.0.0",
      type: "module",
      pi: { extensions: ["./extension.ts"] },
      dependencies: { "@kybernetria/pi-protocol": "^1.0.0" },
    }));
    await writeFile(path.join(testDir, "pi.protocol.json"), JSON.stringify({
      protocolVersion: "0.2.0",
      nodeId: "test_package",
      packageId: "test-package",
      version: "1.0.0",
      purpose: "Test package.",
      agents: {
        my_agent: {
          description: "Test agent.",
          systemPrompt: { text: "You are a test agent.", mode: "append" },
          modelHint: { specific: "opencode-go/deepseek-v4-flash", thinkingLevel: "medium" },
        },
      },
      provides: [
        {
          name: "test_provide",
          description: "A test provide.",
          inputSchema: { type: "object", properties: {}, required: [] },
          outputSchema: { type: "object", properties: {}, required: [] },
          execution: { type: "agent", agent: "my_agent" },
        },
      ],
    }));
    await writeFile(path.join(testDir, "extension.ts"), `
import { ensureProtocolFabric, registerProtocolManifest } from "@kybernetria/pi-protocol";
import manifest from "./pi.protocol.json" with { type: "json" };

const NODE_ID = "test_package";
const fabric = ensureProtocolFabric();
fabric.unregister(NODE_ID);
registerProtocolManifest(fabric, { manifest });
`);
    await writeFile(path.join(testDir, "README.md"), "# Test Package\n\nSee fabric.invoke for usage.\n\nprotocolVersion 0.2.0");

    const result = await validateProtocolPackage(testDir);
    assert.equal(result.pass, true, "Valid package should pass validation. Issues: " + JSON.stringify(result.issues));
    assert.ok(result.detectedFiles.includes("package.json"));
    assert.ok(result.detectedFiles.includes("pi.protocol.json"));
    assert.ok(result.detectedFiles.includes("extension.ts"));
    assert.ok(result.detectedFiles.includes("README.md"));

    console.log("  ✓ Valid package passes validation");
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }

  // Test validation failure cases
  const failDir = await mkdtemp(path.join(tmpdir(), "pi-pi-validation-fail-"));
  try {
    await writeFile(path.join(failDir, "package.json"), JSON.stringify({
      name: "bad-package",
      version: "1.0.0",
      type: "module",
      dependencies: { "@mariozechner/pi-coding-agent": "^1.0.0" },
    }));
    await writeFile(path.join(failDir, "pi.protocol.json"), JSON.stringify({
      protocolVersion: "0.2.0",
      nodeId: "bad_package",
      purpose: "Bad.",
      provides: [
        {
          name: "bad",
          description: "Bad provide.",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          execution: { type: "agent", agent: "nonexistent" },
        },
      ],
    }));
    await writeFile(path.join(failDir, "extension.ts"), `
import { registerProtocolManifest } from "@kybernetria/pi-protocol";
const fabric = undefined as any;
registerProtocolManifest(fabric, { manifest: {} });
`);

    const result = await validateProtocolPackage(failDir);
    assert.equal(result.pass, false, "Bad package should fail validation");
    const issueRules = result.issues.map((i) => i.rule);
    assert.ok(issueRules.includes("package-json.pi.extensions"), "Should flag missing pi.extensions");
    assert.ok(issueRules.includes("dependency.@mariozechner/pi-coding-agent"), "Should flag legacy import");
    assert.ok(issueRules.includes("bootstrap.ensure-fabric"), "Should flag missing ensureProtocolFabric");
    assert.ok(issueRules.includes("bootstrap.unregister"), "Should flag missing unregister");
    assert.ok(issueRules.includes("provide.execution.agent-declared.bad"), "Should flag undeclared agent");

    console.log("  ✓ Invalid package correctly fails validation");
  } finally {
    await rm(failDir, { recursive: true, force: true });
  }
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
    setProtocolInvocationContext(_context?: unknown): void {
      // no-op for fake
    },
  };
}

await main();
