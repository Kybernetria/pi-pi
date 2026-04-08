import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  ensureProtocolAgentProjection,
  ensureProtocolFabric,
  registerProtocolNode,
  type PiProtocolManifest,
  type ProtocolAgentProjectionTarget,
  type ProtocolFabric,
  type ProtocolInvokeResult,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";
import manifest from "../pi.protocol.json" with { type: "json" };
import type {
  BuildCertifiedExtensionInput,
  BuildCertifiedExtensionOutput,
  DescribeCertifiedTemplateOutput,
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

interface BuildCommandEnvelope {
  input?: BuildCertifiedExtensionInput;
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
    routing: "deterministic",
    input,
  })) as ProtocolInvokeResult<TOutput>;
}

function parseValidateCommandInput(
  args: string | undefined,
): ValidateCertifiedNodeInput | Record<string, unknown> {
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

function parseBuildCommandInput(
  args: string | undefined,
): BuildCertifiedExtensionInput | Record<string, unknown> {
  const trimmed = args?.trim();
  if (!trimmed) {
    return { description: "", repoDir: "." };
  }

  if (!trimmed.startsWith("{")) {
    return {
      description: trimmed,
      repoDir: ".",
      applyChanges: true,
    };
  }

  const parsed = parseJsonArgs(trimmed);
  if (!isRecord(parsed)) {
    return { description: "", repoDir: "." };
  }

  const envelope = parsed as BuildCommandEnvelope & Record<string, unknown>;
  return isRecord(envelope.input) ? (envelope.input as BuildCertifiedExtensionInput) : envelope;
}

export default function activate(pi: PiRuntime) {
  const fabric = ensureProtocolFabric(pi);

  pi.on("session_start", async () => {
    ensureProtocolAgentProjection(pi as ProtocolAgentProjectionTarget, fabric);
    if (!fabric.describe(manifest.nodeId)) {
      registerProtocolNode(pi, fabric, {
        manifest: manifest as PiProtocolManifest,
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
    description: "Describe the TypeScript Pi Protocol certified package template",
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

  pi.registerCommand?.("pi-pi-build-certified-extension", {
    description:
      "Build a protocol-certified package in the target repo, validate it before success, and keep the workflow on the certified builder path.",
    handler: async (args, ctx) => {
      try {
        const input = parseBuildCommandInput(args);
        const result = await invokeSelf<BuildCertifiedExtensionOutput>(
          fabric,
          "build_certified_extension",
          input,
        );
        notifyResult(ctx, result);
      } catch (error) {
        ctx.ui.notify(toErrorMessage(error), "error");
      }
    },
  });

  pi.registerCommand?.("pi-pi-validate-certified-extension", {
    description: "Validate a protocol-certified package directory and return a compact certification summary",
    handler: async (args, ctx) => {
      try {
        const input = parseValidateCommandInput(args);
        const result = await invokeSelf<ValidateCertifiedNodeOutput>(
          fabric,
          "validate_certified_extension",
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
