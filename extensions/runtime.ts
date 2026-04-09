import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  ensureProtocolFabric,
  registerProtocolNode,
  type PiProtocolManifest,
  type ProtocolFabric,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";
import {
  createProtocolConversationController,
  resetProtocolConversationState,
} from "./protocol-conversation.ts";
import manifest from "../pi.protocol.json" with { type: "json" };
import { createProtocolHandlers } from "../protocol/handlers.ts";

export type PiRuntime = ExtensionAPI & ProtocolSessionPi;

function registerNodeOnSessionStart(pi: PiRuntime, fabric: ProtocolFabric): void {
  pi.on("session_start", async () => {
    resetProtocolConversationState(pi);
    if (fabric.describe(manifest.nodeId)) {
      return;
    }

    registerProtocolNode(pi, fabric, {
      manifest: manifest as PiProtocolManifest,
      handlers: createProtocolHandlers(pi),
      source: {
        packageName: "pi-pi",
        packageVersion: "0.1.0",
      },
    });
  });

  pi.on("session_shutdown", async () => {
    resetProtocolConversationState(pi);
    if (fabric.describe(manifest.nodeId)) {
      fabric.unregisterNode(manifest.nodeId);
    }
  });
}

export function initializeProtocolRuntime(pi: PiRuntime): ProtocolFabric {
  const fabric = ensureProtocolFabric(pi, {
    conversationController: createProtocolConversationController(),
  });
  registerNodeOnSessionStart(pi, fabric);
  return fabric;
}

