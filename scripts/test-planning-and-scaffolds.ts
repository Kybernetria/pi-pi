import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  planCertifiedNodeFromDescription,
  planBrownfieldMigration,
  scaffoldCertifiedNode,
  validateCertifiedNode,
  type PlanCertifiedNodeFromDescriptionOutput,
  type PlanBrownfieldMigrationOutput,
  type ScaffoldCertifiedNodeOutput,
  type ValidateCertifiedNodeOutput,
} from "../protocol/core.ts";

function requireOk<T>(value: T | undefined, message: string): T {
  assert.ok(value, message);
  return value;
}

async function main(): Promise<void> {
  // A mixed search + summarize brief should stay capability-first and infer both public provides.
  const notesWorkbenchPlan = (await planCertifiedNodeFromDescription({
    description:
      "Build me a certified extension that searches markdown notes for TODOs, summarizes the findings, and offers a local command.",
  })) as PlanCertifiedNodeFromDescriptionOutput;

  assert.equal(notesWorkbenchPlan.recommendedShape, "single-node");
  assert.equal(notesWorkbenchPlan.operatorCommandProjectionSuggested, true);
  assert.deepEqual(
    notesWorkbenchPlan.candidateProvides.map((provide) => provide.name),
    ["summarize_notes", "search_notes", "extract_tasks"],
    "planner should infer multiple realistic candidate provides from plain language",
  );

  const scaffoldInput = requireOk(
    notesWorkbenchPlan.singleNodeScaffoldInput,
    "single-node brief should return scaffold input",
  );
  const scaffold = (await scaffoldCertifiedNode(scaffoldInput)) as ScaffoldCertifiedNodeOutput;
  const handlersFile = scaffold.files["protocol/handlers.ts"];
  const searchInputSchema = scaffold.files["protocol/schemas/search_notes.input.json"];
  const summarizeOutputSchema = scaffold.files["protocol/schemas/summarize_notes.output.json"];
  const extractTasksOutputSchema = scaffold.files["protocol/schemas/extract_tasks.output.json"];

  assert.ok(handlersFile.includes("interface SearchNotesInput"));
  assert.ok(handlersFile.includes("query: string;"));
  assert.ok(handlersFile.includes("matches: SearchNotesMatch[];"));
  assert.ok(handlersFile.includes("interface SummarizeNotesOutput"));
  assert.ok(handlersFile.includes("summary: string;"));
  assert.ok(handlersFile.includes("interface ExtractTasksTask"));
  assert.ok(searchInputSchema.includes('"query"'));
  assert.ok(summarizeOutputSchema.includes('"summary"'));
  assert.ok(extractTasksOutputSchema.includes('"tasks"'));

  // A direct ping scaffold request should stay ping-shaped instead of drifting into validation semantics.
  const pingScaffold = (await scaffoldCertifiedNode({
    packageName: "pi-ping-test",
    nodeId: "pi-ping-test",
    purpose: "A simple protocol-aligned test package with one ping provide.",
    provides: [
      {
        name: "ping",
        description: "Return a simple pong response for protocol alignment checks.",
      },
    ],
    useInlineSchemas: true,
    sdkDependency: "@mariozechner/pi-protocol-sdk",
  })) as ScaffoldCertifiedNodeOutput;

  assert.equal(pingScaffold.sdkDependency, "@mariozechner/pi-protocol-sdk@^0.1.0");
  assert.ok(pingScaffold.files["package.json"].includes('"@mariozechner/pi-protocol-sdk": "^0.1.0"'));
  assert.ok(pingScaffold.files["pi.protocol.json"].includes('"response"'));
  assert.ok(!pingScaffold.files["pi.protocol.json"].includes('"targetPath"'));
  assert.ok(!pingScaffold.files["pi.protocol.json"].includes('"findings"'));
  assert.ok(pingScaffold.files["protocol/handlers.ts"].includes('response: "pong"'));
  assert.ok(!pingScaffold.files["protocol/handlers.ts"].includes("todo: validate"));

  // The validator should now catch a ping provide that secretly uses validation-shaped schemas.
  const badPingDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-bad-ping-"));
  await fs.mkdir(path.join(badPingDir, "extensions"), { recursive: true });
  await fs.mkdir(path.join(badPingDir, "protocol"), { recursive: true });
  await fs.writeFile(
    path.join(badPingDir, "package.json"),
    JSON.stringify(
      {
        name: "bad-ping",
        version: "0.1.0",
        type: "module",
        pi: { extensions: ["./extensions"] },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(badPingDir, "pi.protocol.json"),
    JSON.stringify(
      {
        protocolVersion: "0.1.0",
        nodeId: "bad-ping",
        purpose: "Bad ping example.",
        provides: [
          {
            name: "ping",
            description: "Return pong.",
            handler: "ping",
            inputSchema: {
              type: "object",
              required: ["targetPath"],
              properties: { targetPath: { type: "string" } },
            },
            outputSchema: {
              type: "object",
              required: ["status", "provide", "nodeId", "pass", "findings"],
              properties: {
                status: { type: "string" },
                provide: { type: "string" },
                nodeId: { type: "string" },
                pass: { type: "boolean" },
                findings: { type: "array", items: { type: "object" } },
              },
            },
          },
        ],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(badPingDir, "extensions", "index.ts"),
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
    path.join(badPingDir, "protocol", "handlers.ts"),
    `import type { ProtocolHandler } from "@kyvernitria/pi-protocol-sdk";
export const ping: ProtocolHandler = async (ctx) => ({ status: "todo", provide: "ping", nodeId: ctx.calleeNodeId, pass: false, findings: [] });
`,
    "utf8",
  );

  const badPingValidation = (await validateCertifiedNode({ packageDir: badPingDir })) as ValidateCertifiedNodeOutput;
  assert.equal(badPingValidation.pass, false);
  assert.ok(badPingValidation.violatedRules.some((rule) => rule.rule === "provide.semantic.ping"));

  // A research-flavored brief with explicit collaboration language should choose a pair.
  const researchPairPlan = (await planCertifiedNodeFromDescription({
    description:
      "Build a manager/worker certified pair that delegates research, gathers findings, and synthesizes them for the user.",
  })) as PlanCertifiedNodeFromDescriptionOutput;

  assert.equal(researchPairPlan.recommendedShape, "collaborating-pair");
  assert.equal(researchPairPlan.recommendedWorkerMode, "agent-backed");
  assert.equal(researchPairPlan.collaboratingNodesScaffoldInput?.managerProvideName, "delegate_research");
  assert.equal(researchPairPlan.collaboratingNodesScaffoldInput?.workerProvideName, "perform_research");

  // Brownfield migration planning should inspect an existing repo and map current capabilities first.
  const brownfieldDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-brownfield-"));
  await fs.mkdir(path.join(brownfieldDir, "extensions"), { recursive: true });
  await fs.mkdir(path.join(brownfieldDir, "protocol"), { recursive: true });
  await fs.mkdir(path.join(brownfieldDir, "scripts"), { recursive: true });
  await fs.writeFile(
    path.join(brownfieldDir, "package.json"),
    JSON.stringify(
      {
        name: "brownfield-notes",
        scripts: {
          dev: "tsx scripts/dev.ts",
          migrate: "tsx scripts/migrate.ts",
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await fs.writeFile(path.join(brownfieldDir, "README.md"), "# Notes\n\nExisting workspace note helper.\n", "utf8");
  await fs.writeFile(path.join(brownfieldDir, "TODO.md"), "- ship protocol migration\n", "utf8");
  await fs.writeFile(path.join(brownfieldDir, "extensions", "index.ts"), "export default function activate() {}\n", "utf8");
  await fs.writeFile(path.join(brownfieldDir, "protocol", "handlers.ts"), "export const summarize_notes = () => {};\n", "utf8");
  await fs.writeFile(path.join(brownfieldDir, "scripts", "migrate.ts"), "console.log('migrate');\n", "utf8");

  const brownfieldPlan = (await planBrownfieldMigration({
    repoDir: brownfieldDir,
    includeFileHints: true,
  })) as import("../protocol/core.ts").PlanBrownfieldMigrationOutput;

  assert.equal(brownfieldPlan.repoSummary.packageName, "brownfield-notes");
  assert.ok(brownfieldPlan.capabilityMap.some((entry) => entry.kind === "bootstrap"));
  assert.ok(brownfieldPlan.capabilityMap.some((entry) => entry.kind === "handler"));
  assert.ok(brownfieldPlan.proposedPublicProvides.length > 0);
  assert.ok(brownfieldPlan.proposedProjections.includes("/migrate"));
  assert.ok(brownfieldPlan.migrationSteps.length >= 3);
  assert.ok(brownfieldPlan.fileHints?.["pi.protocol.json"]?.[0]);

  console.log("planning, scaffold, and brownfield migration heuristics passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
