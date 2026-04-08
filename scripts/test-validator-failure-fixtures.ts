import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateCertifiedNode, type ValidateCertifiedNodeOutput } from "../protocol/core.ts";

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function createBaseFixture(rootDir: string): Promise<void> {
  await fs.mkdir(path.join(rootDir, "extensions"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "protocol"), { recursive: true });
  await writeJson(path.join(rootDir, "package.json"), {
    name: "fixture-node",
    version: "0.1.0",
    type: "module",
    pi: { extensions: ["./extensions"] },
  });
  await writeJson(path.join(rootDir, "pi.protocol.json"), {
    protocolVersion: "0.1.0",
    nodeId: "fixture-node",
    purpose: "Fixture node for validator failures.",
    provides: [
      {
        name: "ping",
        description: "Return pong.",
        handler: "ping",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          required: ["status", "provide", "nodeId", "response"],
          properties: {
            status: { type: "string" },
            provide: { type: "string" },
            nodeId: { type: "string" },
            response: { type: "string" },
          },
        },
      },
    ],
  });
}

async function main(): Promise<void> {
  const projectionFixture = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-validator-projection-"));
  await createBaseFixture(projectionFixture);
  await fs.writeFile(
    path.join(projectionFixture, "extensions", "index.ts"),
    `import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { ensureProtocolAgentProjection, ensureProtocolFabric, registerProtocolNode, type ProtocolAgentProjectionTarget } from "@kyvernitria/pi-protocol-sdk";
import manifest from "../pi.protocol.json" with { type: "json" };
import * as handlers from "../protocol/handlers.ts";
export default function activate(pi: ExtensionAPI) {
  const fabric = ensureProtocolFabric(pi);
  ensureProtocolAgentProjection(pi as ProtocolAgentProjectionTarget, fabric);
  pi.on("session_start", async () => {
    registerProtocolNode(pi, fabric, { manifest, handlers });
  });
  pi.on("session_shutdown", async () => {
    fabric.unregisterNode(manifest.nodeId);
  });
  return fabric;
}
`,
    "utf8",
  );
  await fs.writeFile(
    path.join(projectionFixture, "protocol", "handlers.ts"),
    `import type { ProtocolHandler } from "@kyvernitria/pi-protocol-sdk";
export const ping: ProtocolHandler = async (ctx) => ({ status: "ok", provide: "ping", nodeId: ctx.calleeNodeId, response: "pong" });
`,
    "utf8",
  );

  const projectionValidation = (await validateCertifiedNode({
    packageDir: projectionFixture,
  })) as ValidateCertifiedNodeOutput;
  assert.equal(projectionValidation.pass, false);
  assert.ok(
    projectionValidation.violatedRules.some((rule) => rule.rule === "bootstrap.ensure-protocol-projection.session-start"),
  );

  const missingHandlerFixture = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-validator-handler-"));
  await createBaseFixture(missingHandlerFixture);
  await fs.writeFile(
    path.join(missingHandlerFixture, "extensions", "index.ts"),
    `import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { ensureProtocolAgentProjection, ensureProtocolFabric, registerProtocolNode, type ProtocolAgentProjectionTarget } from "@kyvernitria/pi-protocol-sdk";
import manifest from "../pi.protocol.json" with { type: "json" };
import * as handlers from "../protocol/handlers.ts";
export default function activate(pi: ExtensionAPI) {
  const fabric = ensureProtocolFabric(pi);
  pi.on("session_start", async () => {
    ensureProtocolAgentProjection(pi as ProtocolAgentProjectionTarget, fabric);
    registerProtocolNode(pi, fabric, { manifest, handlers });
  });
  pi.on("session_shutdown", async () => {
    fabric.unregisterNode(manifest.nodeId);
  });
  return fabric;
}
`,
    "utf8",
  );
  await fs.writeFile(
    path.join(missingHandlerFixture, "protocol", "handlers.ts"),
    `export const pong = async () => ({ ok: true });
`,
    "utf8",
  );

  const missingHandlerValidation = (await validateCertifiedNode({
    packageDir: missingHandlerFixture,
  })) as ValidateCertifiedNodeOutput;
  assert.equal(missingHandlerValidation.pass, false);
  assert.ok(
    missingHandlerValidation.violatedRules.some((rule) => rule.rule === "provide.handler-missing.ping"),
  );

  console.log("validator failure fixtures passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
