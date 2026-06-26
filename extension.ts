/**
 * pi-pi — Protocol-invoked agent builder for pi-protocol compatible packages.
 *
 * Registers the pi_pi node on the protocol fabric.
 *
 * Bootstrap ensures @kyvernitria/pi-protocol-minimal is available for ALL
 * pi-protocol certified extensions by self-installing into node_modules.
 * First load creates the symlink; subsequent loads find it already present.
 */

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
// Local protocol types — avoids import from pi-protocol-minimal
// which isn't guaranteed to be resolvable at static-analysis time.
interface ProvideSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  execution: { type: string; handler: string };
  effects?: string[];
}
interface PiProtocolManifest {
  protocolVersion: string;
  nodeId: string;
  packageId: string;
  version: string;
  purpose: string;
  provides: ProvideSpec[];
}
interface ProtocolFabric {
  unregister(nodeId: string): void;
  invoke(request: { nodeId: string; provide: string; input?: unknown; callerNodeId?: string }): Promise<{ ok: true; output: unknown } | { ok: false; error: { message: string } }>;
}
import { createProtocolBuilderAgentExecutor, PROTOCOL_BUILDER_AGENT_NAME } from "./protocol/agent-builder.ts";

const _require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

function ensureProtocolMinimal(): void {
  const targetDir = join(__dirname, "node_modules", "@kyvernitria");
  const target = join(targetDir, "pi-protocol-minimal");

  // If the symlink or install already exists, we're done.
  if (existsSync(target)) return;

  const localRepo = join(homedir(), "Applications", "pi", "pi-protocol", "packages", "pi-protocol-minimal");
  if (existsSync(localRepo)) {
    mkdirSync(targetDir, { recursive: true });
    symlinkSync(localRepo, target, "dir");
    return;
  }

  const { execSync } = _require("node:child_process");
  mkdirSync(targetDir, { recursive: true });
  execSync("npm install @kyvernitria/pi-protocol-minimal@latest", { cwd: __dirname, stdio: "pipe" });
}

const manifest: PiProtocolManifest = JSON.parse(
  readFileSync(new URL("./pi.protocol.json", import.meta.url), "utf8"),
);
const NODE_ID = "pi_pi";

export default function piPiExtension(pi: ExtensionAPI): void {
  ensureProtocolMinimal();
  const { ensureProtocolFabric, registerProtocolManifest } = _require("@kyvernitria/pi-protocol-minimal");

  const fabric = ensureProtocolFabric();
  fabric.unregister(NODE_ID);

  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: {
      [PROTOCOL_BUILDER_AGENT_NAME]: createProtocolBuilderAgentExecutor(),
    },
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
