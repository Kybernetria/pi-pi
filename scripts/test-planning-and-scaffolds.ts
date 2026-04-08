import assert from "node:assert/strict";
import {
  planCertifiedNodeFromDescription,
  scaffoldCertifiedNode,
  type PlanCertifiedNodeFromDescriptionOutput,
  type ScaffoldCertifiedNodeOutput,
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

  // A research-flavored brief with explicit collaboration language should choose a pair.
  const researchPairPlan = (await planCertifiedNodeFromDescription({
    description:
      "Build a manager/worker certified pair that delegates research, gathers findings, and synthesizes them for the user.",
  })) as PlanCertifiedNodeFromDescriptionOutput;

  assert.equal(researchPairPlan.recommendedShape, "collaborating-pair");
  assert.equal(researchPairPlan.recommendedWorkerMode, "agent-backed");
  assert.equal(researchPairPlan.collaboratingNodesScaffoldInput?.managerProvideName, "delegate_research");
  assert.equal(researchPairPlan.collaboratingNodesScaffoldInput?.workerProvideName, "perform_research");

  console.log("planning and scaffold heuristics passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
