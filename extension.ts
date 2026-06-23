import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  ensureProtocolFabric,
  registerProtocolManifest,
  type PiProtocolManifest,
  type ProtocolFabric,
} from "@kyvernitria/pi-protocol-minimal";
import { createHandlers } from "./protocol/handlers.ts";

const NODE_ID = "pi_pi";

const manifest: PiProtocolManifest = {
  protocolVersion: "0.2.0",
  nodeId: NODE_ID,
  packageId: "pi-pi",
  version: "0.1.0",
  purpose: "Agent-backed builder for pi-protocol compatible Pi packages/extensions.",
  provides: [
    {
      name: "build_package",
      description: "Chat with the pi-pi builder agent and have it build the requested package/extension in targetDir.",
      inputSchema: {
        type: "object",
        required: ["request", "targetDir"],
        properties: {
          request: { type: "string" },
          targetDir: { type: "string" },
        },
      },
      outputSchema: {
        type: "object",
        required: ["status", "summary"],
        properties: {
          status: { type: "string", enum: ["completed", "clarification_needed", "unsupported", "failed"] },
          summary: { type: "string" },
          targetDir: { type: "string" },
          filesWritten: { type: "array", items: { type: "string" } },
          nextSteps: { type: "array", items: { type: "string" } },
          diagnostics: { type: "array", items: { type: "string" } },
        },
      },
      execution: { type: "handler", handler: "build_package" },
      effects: ["file_read", "file_write"],
    },
  ],
};

export default function piPiExtension(pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();

  fabric.unregister(NODE_ID);
  fabric.unregister("pi-pi");

  registerProtocolManifest(fabric, {
    manifest,
    handlers: createHandlers({ pi, fabric }),
  });

  registerSlashCommands(pi, fabric);
}

function registerSlashCommands(pi: ExtensionAPI, fabric: ProtocolFabric): void {
  pi.registerCommand("pi_pi.build", {
    description: "Ask pi-pi to build a pi-protocol package/extension. Requires: <targetDir> <request>.",
    handler: async (args: string) => {
      const parsed = parseBuildArgs(args);
      if (!parsed) {
        postCommandResult(pi, "**pi_pi.build usage**\n\n`/pi_pi.build /absolute/target/dir build a protocol package that ...`\n\nThe protocol provide is `pi_pi.build_package` with `{ request, targetDir }`.");
        return;
      }

      const result = await fabric.invoke({
        nodeId: NODE_ID,
        provide: "build_package",
        input: parsed,
      });
      if (!result.ok) throw new Error(result.error.message);
      postCommandResult(pi, formatCommandOutput(result.output));
    },
  });
}

function parseBuildArgs(args: string): { targetDir: string; request: string } | undefined {
  const text = args.trim();
  const match = text.match(/^(\S+)\s+([\s\S]+)$/);
  if (!match) return undefined;
  const [, targetDir, request] = match;
  if (!targetDir || !request?.trim()) return undefined;
  return { targetDir, request: request.trim() };
}

function formatCommandOutput(output: unknown): string {
  const result = output as { summary?: unknown; nextSteps?: unknown; diagnostics?: unknown; filesWritten?: unknown };
  const parts = ["**pi_pi.build**", String(result.summary ?? JSON.stringify(output, null, 2))];
  if (Array.isArray(result.filesWritten) && result.filesWritten.length > 0) {
    parts.push(`Files written: ${result.filesWritten.map(String).join(", ")}`);
  }
  if (Array.isArray(result.nextSteps) && result.nextSteps.length > 0) {
    parts.push(`Next steps:\n${result.nextSteps.map((item) => `- ${String(item)}`).join("\n")}`);
  }
  if (Array.isArray(result.diagnostics) && result.diagnostics.length > 0) {
    parts.push(`Diagnostics:\n${result.diagnostics.map((item) => `- ${String(item)}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

function postCommandResult(pi: ExtensionAPI, content: string): void {
  const api = pi as ExtensionAPI & { sendMessage?: (message: { customType: string; content: string; display: boolean }) => void; sendUserMessage?: (message: string, options?: unknown) => void };
  if (typeof api.sendMessage === "function") {
    api.sendMessage({ customType: "pi_pi.command_result", content, display: true });
    return;
  }
  api.sendUserMessage?.(content, { deliverAs: "followUp" });
}
