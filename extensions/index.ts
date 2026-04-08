import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  ensureProtocolAgentProjection,
  ensureProtocolFabric,
  registerProtocolNode,
  type ProtocolAgentProjectionTarget,
  type ProtocolFabric,
  type ProtocolInvokeResult,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";
import manifest from "../pi.protocol.json" with { type: "json" };
import type {
  DescribeCertifiedTemplateOutput,
  PlanCertifiedNodeFromDescriptionInput,
  PlanCertifiedNodeFromDescriptionOutput,
  ScaffoldCertifiedNodeInput,
  ScaffoldCertifiedNodeOutput,
  ScaffoldCollaboratingNodesInput,
  ScaffoldCollaboratingNodesOutput,
  ValidateCertifiedNodeInput,
  ValidateCertifiedNodeOutput,
} from "../protocol/core.ts";
import * as handlers from "../protocol/handlers.ts";

interface CommandContext {
  ui: {
    notify: (message: string, level?: "info" | "error") => void;
  };
}

interface RegisteredCommand {
  description: string;
  handler: (args: string, ctx: CommandContext) => Promise<void> | void;
}

type PiRuntime = ExtensionAPI &
  ProtocolSessionPi & {
    registerCommand?: (name: string, command: RegisteredCommand) => void;
  };

interface PiPiPlanCommandEnvelope {
  input?: PlanCertifiedNodeFromDescriptionInput;
}

interface PiPiNewCommandEnvelope {
  destinationDir?: string;
  input?: ScaffoldCertifiedNodeInput;
}

interface PiPiNewPairCommandEnvelope {
  destinationDir?: string;
  input?: ScaffoldCollaboratingNodesInput;
}

function parseJsonArgs(args: string | undefined, fallback: unknown = {}): unknown {
  const trimmed = args?.trim();
  if (!trimmed) return fallback;
  return JSON.parse(trimmed) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notifyResult<TOutput>(ctx: CommandContext, result: ProtocolInvokeResult<TOutput>): void {
  ctx.ui.notify(JSON.stringify(result, null, 2), result.ok ? "info" : "error");
}

async function invokeSelf<TOutput>(
  fabric: ProtocolFabric,
  provide: string,
  input: unknown,
): Promise<ProtocolInvokeResult<TOutput>> {
  return (await fabric.invoke({
    callerNodeId: manifest.nodeId,
    provide,
    target: { nodeId: manifest.nodeId },
    input,
  })) as ProtocolInvokeResult<TOutput>;
}

function parseValidateCommandInput(args: string | undefined): ValidateCertifiedNodeInput | Record<string, unknown> {
  const trimmed = args?.trim();
  if (!trimmed) {
    return { packageDir: "." };
  }

  if (trimmed.startsWith("{")) {
    const parsed = parseJsonArgs(trimmed);
    return isRecord(parsed) ? parsed : {};
  }

  return { packageDir: trimmed };
}

function parsePlanCommandInput(
  args: string | undefined,
): PlanCertifiedNodeFromDescriptionInput | Record<string, unknown> {
  const trimmed = args?.trim();
  if (!trimmed) {
    return { description: "" };
  }

  if (!trimmed.startsWith("{")) {
    return { description: trimmed };
  }

  const parsed = parseJsonArgs(trimmed);
  if (!isRecord(parsed)) {
    return { description: "" };
  }

  const envelope = parsed as PiPiPlanCommandEnvelope & Record<string, unknown>;
  return isRecord(envelope.input) ? (envelope.input as PlanCertifiedNodeFromDescriptionInput) : envelope;
}

function parseNewCommandInput(
  args: string | undefined,
): { destinationDir?: string; input: ScaffoldCertifiedNodeInput | Record<string, unknown> } {
  const parsed = parseJsonArgs(args);
  if (!isRecord(parsed)) {
    return { input: {} };
  }

  const envelope = parsed as PiPiNewCommandEnvelope & Record<string, unknown>;
  return {
    destinationDir: typeof envelope.destinationDir === "string" ? envelope.destinationDir : undefined,
    input: isRecord(envelope.input) ? (envelope.input as ScaffoldCertifiedNodeInput) : envelope,
  };
}

function parseNewPairCommandInput(
  args: string | undefined,
): { destinationDir?: string; input: ScaffoldCollaboratingNodesInput | Record<string, unknown> } {
  const parsed = parseJsonArgs(args);
  if (!isRecord(parsed)) {
    return { input: {} };
  }

  const envelope = parsed as PiPiNewPairCommandEnvelope & Record<string, unknown>;
  return {
    destinationDir: typeof envelope.destinationDir === "string" ? envelope.destinationDir : undefined,
    input: isRecord(envelope.input) ? (envelope.input as ScaffoldCollaboratingNodesInput) : envelope,
  };
}

async function writeFiles(rootDir: string, files: Record<string, string>): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, join, resolve } = await import("node:path");
  const resolvedRootDir = resolve(rootDir);

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(resolvedRootDir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
  }
}

export default function activate(pi: PiRuntime) {
  const fabric = ensureProtocolFabric(pi);

  pi.on("session_start", async () => {
    ensureProtocolAgentProjection(pi as ProtocolAgentProjectionTarget, fabric);
    if (!fabric.describe(manifest.nodeId)) {
      registerProtocolNode(pi, fabric, {
        manifest,
        handlers,
        source: {
          packageName: "pi-pi",
          packageVersion: "0.1.0",
        },
      });
    }
  });

  pi.on("session_shutdown", async () => {
    if (fabric.describe(manifest.nodeId)) {
      fabric.unregisterNode(manifest.nodeId);
    }
  });

  pi.registerCommand?.("pi-pi-template", {
    description: "Describe the TypeScript Pi Protocol certified-node template",
    handler: async (args, ctx) => {
      try {
        const input = parseJsonArgs(args, {});
        const result = await invokeSelf<DescribeCertifiedTemplateOutput>(
          fabric,
          "describe_certified_template",
          input,
        );
        notifyResult(ctx, result);
      } catch (error) {
        ctx.ui.notify(toErrorMessage(error), "error");
      }
    },
  });

  pi.registerCommand?.("pi-pi-plan", {
    description: "Interpret a natural-language extension brief into a scaffold-ready certified-node plan",
    handler: async (args, ctx) => {
      try {
        const input = parsePlanCommandInput(args);
        const result = await invokeSelf<PlanCertifiedNodeFromDescriptionOutput>(
          fabric,
          "plan_certified_node_from_description",
          input,
        );
        notifyResult(ctx, result);
      } catch (error) {
        ctx.ui.notify(toErrorMessage(error), "error");
      }
    },
  });

  pi.registerCommand?.("pi-pi-new", {
    description:
      "Generate a certified node template from JSON input and optionally write it to destinationDir",
    handler: async (args, ctx) => {
      try {
        const { destinationDir, input } = parseNewCommandInput(args);
        const result = await invokeSelf<ScaffoldCertifiedNodeOutput>(
          fabric,
          "scaffold_certified_node",
          input,
        );

        if (result.ok && destinationDir) {
          await writeFiles(destinationDir, result.output.files);
        }

        notifyResult(ctx, result);
      } catch (error) {
        ctx.ui.notify(toErrorMessage(error), "error");
      }
    },
  });

  pi.registerCommand?.("pi-pi-new-pair", {
    description:
      "Generate a collaborating manager/worker pair and optionally write both packages under destinationDir",
    handler: async (args, ctx) => {
      try {
        const { destinationDir, input } = parseNewPairCommandInput(args);
        const result = await invokeSelf<ScaffoldCollaboratingNodesOutput>(
          fabric,
          "scaffold_collaborating_nodes",
          input,
        );

        if (result.ok && destinationDir) {
          await writeFiles(`${destinationDir}/${result.output.manager.packageName}`, result.output.manager.files);
          await writeFiles(`${destinationDir}/${result.output.worker.packageName}`, result.output.worker.files);
        }

        notifyResult(ctx, result);
      } catch (error) {
        ctx.ui.notify(toErrorMessage(error), "error");
      }
    },
  });

  pi.registerCommand?.("pi-pi-validate", {
    description: "Run heuristic source-based validation for a candidate certified-node package directory",
    handler: async (args, ctx) => {
      try {
        const input = parseValidateCommandInput(args);
        const result = await invokeSelf<ValidateCertifiedNodeOutput>(
          fabric,
          "validate_certified_node",
          input,
        );
        notifyResult(ctx, result);
      } catch (error) {
        ctx.ui.notify(toErrorMessage(error), "error");
      }
    },
  });

  return fabric;
}
