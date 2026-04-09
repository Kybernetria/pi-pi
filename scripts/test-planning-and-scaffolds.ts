import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  planCertifiedNodeFromDescription,
  planBrownfieldMigration,
  scaffoldCertifiedNode,
  scaffoldCollaboratingNodes,
  validateCertifiedNode,
  type PlanCertifiedNodeFromDescriptionOutput,
  type PlanBrownfieldMigrationOutput,
  type ScaffoldCertifiedNodeOutput,
  type ScaffoldCollaboratingNodesOutput,
  type ValidateCertifiedNodeOutput,
} from "../protocol/core.ts";

function requireOk<T>(value: T | undefined, message: string): T {
  assert.ok(value, message);
  return value;
}

async function materializeScaffoldFiles(targetDir: string, files: Record<string, string>): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(targetDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");
  }
}

async function main(): Promise<void> {
  // A mixed search + summarize brief should stay capability-first and infer both public provides.
  const notesWorkbenchPlan = (await planCertifiedNodeFromDescription({
    description:
      "Build me a certified extension that searches markdown notes for TODOs, summarizes the findings, and offers a local command.",
  })) as PlanCertifiedNodeFromDescriptionOutput;

  const urlSummaryPlan = (await planCertifiedNodeFromDescription({
    description: "Build me a certified extension that summarizes the contents of a URL.",
  })) as PlanCertifiedNodeFromDescriptionOutput;

  assert.deepEqual(
    urlSummaryPlan.candidateProvides.map((provide) => provide.name),
    ["summarize_url"],
    "planner should infer a URL-specific summarize provide from plain language",
  );

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
  const notesWorkbenchDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-notes-workbench-"));
  await materializeScaffoldFiles(notesWorkbenchDir, scaffold.files);
  const notesWorkbenchValidation = (await validateCertifiedNode({ packageDir: notesWorkbenchDir })) as ValidateCertifiedNodeOutput;

  assert.equal(notesWorkbenchValidation.pass, true);
  assert.deepEqual(
    notesWorkbenchValidation.normalizedSummary.provides.map((provide) => provide.name),
    notesWorkbenchPlan.candidateProvides.map((provide) => provide.name),
    "generated scaffold should preserve the planned public provide surface",
  );

  const loadingConfigPlan = (await planCertifiedNodeFromDescription({
    description:
      "Build a Pi package named pi-ck that manages next-session Pi package loading configuration. It should expose exactly two public provides: answer_loading_question and configure_package_loading. Any applied config only takes effect after manual /reload or next session startup.",
  })) as PlanCertifiedNodeFromDescriptionOutput;

  assert.equal(loadingConfigPlan.recommendedShape, "single-node");
  assert.equal(loadingConfigPlan.suggestedPackageName, "pi-ck");
  assert.equal(loadingConfigPlan.suggestedNodeId, "pi-ck");
  assert.deepEqual(
    loadingConfigPlan.candidateProvides.map((provide) => provide.name),
    ["answer_loading_question", "configure_package_loading"],
    "planner should preserve explicit requested public provide names for next-session package-loading managers",
  );

  const loadingConfigScaffold = (await scaffoldCertifiedNode(
    requireOk(loadingConfigPlan.singleNodeScaffoldInput, "loading-config brief should return scaffold input"),
  )) as ScaffoldCertifiedNodeOutput;
  const loadingConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-loading-config-"));
  await materializeScaffoldFiles(loadingConfigDir, loadingConfigScaffold.files);
  const loadingConfigValidation = (await validateCertifiedNode({ packageDir: loadingConfigDir })) as ValidateCertifiedNodeOutput;

  assert.equal(loadingConfigValidation.pass, true);
  assert.deepEqual(
    loadingConfigScaffold.generatedProvides.map((provide) => provide.name),
    ["answer_loading_question", "configure_package_loading"],
    "next-session settings-manager briefs should stay in scope and preserve explicit public provide names",
  );
  assert.deepEqual(
    loadingConfigValidation.normalizedSummary.provides.map((provide) => provide.name),
    ["answer_loading_question", "configure_package_loading"],
    "validated scaffold should expose the requested public provides",
  );

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
  })) as ScaffoldCertifiedNodeOutput;

  assert.equal(pingScaffold.sdkDistribution, "vendored-shim");
  assert.ok(!pingScaffold.files["package.json"].includes("pi-protocol-sdk"));
  assert.ok(pingScaffold.files["vendor/pi-protocol-sdk.ts"].includes("export const FABRIC_KEY"));
  assert.ok(pingScaffold.files["pi.protocol.json"].includes('"response"'));
  assert.ok(!pingScaffold.files["pi.protocol.json"].includes('"targetPath"'));
  assert.ok(!pingScaffold.files["pi.protocol.json"].includes('"findings"'));
  const pingDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-ping-"));
  await materializeScaffoldFiles(pingDir, pingScaffold.files);
  const pingValidation = (await validateCertifiedNode({ packageDir: pingDir })) as ValidateCertifiedNodeOutput;

  assert.equal(pingValidation.pass, true);

  // The validator should now catch a ping provide that secretly uses validation-shaped schemas.
  const badPingDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-bad-ping-"));
  await fs.mkdir(path.join(badPingDir, "extensions"), { recursive: true });
  await fs.mkdir(path.join(badPingDir, "protocol"), { recursive: true });
  await fs.mkdir(path.join(badPingDir, "vendor"), { recursive: true });
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
import { ensureProtocolAgentProjection, ensureProtocolFabric, registerProtocolNode, type ProtocolAgentProjectionTarget } from "../vendor/pi-protocol-sdk.ts";
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
    `import type { ProtocolHandler } from "../vendor/pi-protocol-sdk.ts";
export const ping: ProtocolHandler = async (ctx) => ({ status: "todo", provide: "ping", nodeId: ctx.calleeNodeId, pass: false, findings: [] });
`,
    "utf8",
  );
  await fs.writeFile(path.join(badPingDir, "vendor", "pi-protocol-sdk.ts"), pingScaffold.files["vendor/pi-protocol-sdk.ts"], "utf8");

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

  const pairScaffold = (await scaffoldCollaboratingNodes(
    requireOk(researchPairPlan.collaboratingNodesScaffoldInput, "pair brief should return collaborating scaffold input"),
  )) as ScaffoldCollaboratingNodesOutput;
  const pairManagerDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-pair-manager-"));
  const pairWorkerDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-pi-pair-worker-"));
  await materializeScaffoldFiles(pairManagerDir, pairScaffold.manager.files);
  await materializeScaffoldFiles(pairWorkerDir, pairScaffold.worker.files);
  const pairManagerValidation = (await validateCertifiedNode({ packageDir: pairManagerDir })) as ValidateCertifiedNodeOutput;
  const pairWorkerValidation = (await validateCertifiedNode({ packageDir: pairWorkerDir })) as ValidateCertifiedNodeOutput;

  assert.equal(pairManagerValidation.pass, true);
  assert.equal(pairWorkerValidation.pass, true);
  assert.ok(Object.keys(pairScaffold.worker.files).some((filePath) => filePath.startsWith("protocol/prompts/")));
  assert.ok(!pairScaffold.worker.files["pi.protocol.json"].includes("protocol/prompts/"));

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
  assert.ok(brownfieldPlan.patchGuidance.some((entry) => entry.file === "pi.protocol.json"));
  assert.ok(brownfieldPlan.fileHints?.["pi.protocol.json"]?.[0]);

  console.log("planning, scaffold, and brownfield migration heuristics passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
