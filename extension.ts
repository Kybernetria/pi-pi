/**
 * pi-pi — Protocol-invoked agent builder for pi-protocol compatible packages.
 *
 * Registers the pi_pi node on the protocol fabric.
 */

import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest, type ProtocolFabric } from "@kybernetria/pi-protocol";
import { createProtocolBuilderAgentExecutor, PROTOCOL_BUILDER_AGENT_NAME } from "./protocol/agent-builder.ts";

const manifest: PiProtocolManifest = JSON.parse(
  readFileSync(new URL("./pi.protocol.json", import.meta.url), "utf8"),
);
const NODE_ID = "pi_pi";

export default function piPiExtension(pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();
  fabric.unregister(NODE_ID);

  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: {
      [PROTOCOL_BUILDER_AGENT_NAME]: createProtocolBuilderAgentExecutor({
        sessionOptions: createModelHintSessionOptions(manifest.agents?.[PROTOCOL_BUILDER_AGENT_NAME]?.modelHint),
      }),
    },
  });

  registerSlashCommands(pi, fabric);
}

function createModelHintSessionOptions(modelHint: NonNullable<PiProtocolManifest["agents"]>[string]["modelHint"] | undefined): Record<string, unknown> | undefined {
  if (!modelHint?.specific && !modelHint?.thinkingLevel) return undefined;
  return {
    ...(modelHint.specific ? { protocolModelHint: modelHint } : {}),
    ...(modelHint.thinkingLevel ? { thinkingLevel: modelHint.thinkingLevel } : {}),
  };
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

      try {
        const { invokeProtocol } = await import("./protocol/invoke.js");
        const result = await invokeProtocol(parsed);
        postCommandResult(pi, `**pi_pi.build**\n\nResult: ${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        postCommandResult(pi, `**pi_pi.build**\n\nError: ${msg}`);
      }
    },
  });
}

function parseBuildArgs(args: string): { targetDir: string; request: string } | null {
  const parts = args.trim().match(/^(\S+)\s+(.+)$/);
  if (!parts) return null;
  return { targetDir: parts[1], request: parts[2] };
}

function postCommandResult(pi: ExtensionAPI, content: string): void {
  pi.sendMessage({
    customType: "pi-pi.command_result",
    content,
    display: true,
  });
}
