import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  ensureProtocolFabric,
  registerProtocolManifest,
  type PiProtocolManifest,
  type ProtocolFabric,
} from "@kyvernitria/pi-protocol-minimal";
import { createHandlers } from "./protocol/handlers.ts";

const NODE_ID = "pi_pi";

// Keep the registration manifest inline as well as in pi.protocol.json. Some Pi
// extension loaders cache JSON modules aggressively during reload; an inline
// manifest prevents a stale legacy 0.1 manifest from being registered.
const manifest: PiProtocolManifest = {
  protocolVersion: "0.2.0",
  nodeId: NODE_ID,
  packageId: "pi-pi",
  version: "0.1.0",
  purpose: "Build, adapt, and repair pi-protocol compatible Pi packages/extensions.",
  provides: [
    {
      name: "build_package",
      description: "Build or repair a pi-protocol compatible package from a natural-language request.",
      inputSchema: {
        type: "object",
        required: ["request"],
        properties: {
          request: { type: "string" },
          targetDir: { type: "string" },
          applyChanges: { type: "boolean" },
          mode: { type: "string", enum: ["new", "adapt", "repair", "explain"] },
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
          plan: { type: "array", items: { type: "string" } },
          filePreviews: { type: "array", items: { type: "string" } },
        },
      },
      execution: { type: "handler", handler: "build_package" },
      effects: ["file_read", "file_write"],
    },
    {
      name: "chat",
      description: "Chat-style alias for build_package. Use input.message or input.request.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
          request: { type: "string" },
          targetDir: { type: "string" },
          applyChanges: { type: "boolean" },
          mode: { type: "string", enum: ["new", "adapt", "repair", "explain"] },
        },
      },
      outputSchema: {
        type: "object",
        required: ["status", "summary"],
        properties: {
          status: { type: "string" },
          summary: { type: "string" },
          targetDir: { type: "string" },
          filesWritten: { type: "array", items: { type: "string" } },
          nextSteps: { type: "array", items: { type: "string" } },
          diagnostics: { type: "array", items: { type: "string" } },
          plan: { type: "array", items: { type: "string" } },
          filePreviews: { type: "array", items: { type: "string" } },
        },
      },
      execution: { type: "handler", handler: "chat" },
      effects: ["file_read", "file_write"],
    },
  ],
};

export default function piPiExtension(pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();

  // Reload-friendly: replace this package's node when the extension reloads.
  fabric.unregister(NODE_ID);
  // Also clear the legacy 0.1 node id if an older pi-pi build registered it in this process.
  fabric.unregister("pi-pi");

  registerProtocolManifest(fabric, {
    manifest,
    handlers: createHandlers({ pi, fabric }),
  });

  registerSlashCommands(pi, fabric);
}

function registerSlashCommands(pi: ExtensionAPI, fabric: ProtocolFabric): void {
  pi.registerCommand("pi_pi.build", {
    description: "Build, adapt, repair, or explain a pi-protocol package.",
    handler: async (args: string, _ctx: unknown) => {
      const request = args.trim();
      if (!request) {
        postCommandResult(pi, "**pi_pi.build usage**\n\n`/pi_pi.build explain the required files for a pi-protocol package`\n\nSlash command calls are plan-only by default. Use protocol invoke with `targetDir` and `applyChanges: true` to write files.");
        return;
      }

      const result = await fabric.invoke({
        nodeId: NODE_ID,
        provide: "build_package",
        input: { request, mode: inferMode(request), applyChanges: false },
      });
      if (!result.ok) throw new Error(result.error.message);
      postCommandResult(pi, formatCommandOutput(result.output));
    },
  });

  pi.registerCommand("pi_pi.chat", {
    description: "Chat with the pi-protocol package builder.",
    handler: async (args: string, _ctx: unknown) => {
      const message = args.trim();
      if (!message) {
        postCommandResult(pi, "**pi_pi.chat usage**\n\n`/pi_pi.chat repair this package so it conforms to pi-protocol 0.2.0`");
        return;
      }
      const result = await fabric.invoke({ nodeId: NODE_ID, provide: "chat", input: { message, applyChanges: false } });
      if (!result.ok) throw new Error(result.error.message);
      postCommandResult(pi, formatCommandOutput(result.output));
    },
  });
}

function inferMode(request: string): "new" | "adapt" | "repair" | "explain" {
  const lower = request.toLowerCase();
  if (/\b(explain|what files|required files|describe)\b/.test(lower)) return "explain";
  if (/\b(repair|fix|conform|validate)\b/.test(lower)) return "repair";
  if (/\b(adapt|migrate|convert|existing)\b/.test(lower)) return "adapt";
  return "new";
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
