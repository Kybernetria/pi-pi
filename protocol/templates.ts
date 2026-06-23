import type { GeneratedPackageSpec } from "./schemas.ts";

export interface GeneratedPackageFiles {
  files: Record<string, string>;
}

export function renderGeneratedPackage(spec: GeneratedPackageSpec): GeneratedPackageFiles {
  const manifest = {
    protocolVersion: "0.2.0",
    nodeId: spec.nodeId,
    packageId: spec.packageName,
    version: "0.1.0",
    purpose: spec.purpose,
    provides: [
      {
        name: spec.provideName,
        description: spec.provideDescription,
        inputSchema: {
          type: "object",
          required: ["request"],
          properties: { request: { type: "string" } },
        },
        outputSchema: {
          type: "object",
          required: ["summary"],
          properties: { summary: { type: "string" } },
        },
        execution: { type: "handler", handler: spec.handlerName },
      },
    ],
  };

  return {
    files: {
      "package.json": renderJson({
        name: spec.packageName,
        version: "0.1.0",
        type: "module",
        exports: "./extension.ts",
        pi: { extensions: ["./extension.ts"] },
        dependencies: { "@kyvernitria/pi-protocol-minimal": "0.0.0-prototype" },
        peerDependencies: { "@earendil-works/pi-coding-agent": "*" },
        peerDependenciesMeta: { "@earendil-works/pi-coding-agent": { optional: true } },
      }),
      "pi.protocol.json": renderJson(manifest),
      "extension.ts": renderExtension(spec),
      "protocol/handlers.ts": renderHandlers(spec),
      "README.md": renderReadme(spec),
    },
  };
}

function renderExtension(spec: GeneratedPackageSpec): string {
  const command = spec.slashCommandName ?? `${spec.nodeId}.${spec.provideName}`;
  return `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";\nimport { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";\nimport manifestJson from "./pi.protocol.json" with { type: "json" };\nimport { createHandlers } from "./protocol/handlers.ts";\n\nconst manifest = manifestJson as PiProtocolManifest;\n\nexport default function ${toIdentifier(spec.nodeId)}Extension(pi: ExtensionAPI): void {\n  const fabric = ensureProtocolFabric();\n  fabric.unregister("${spec.nodeId}");\n  registerProtocolManifest(fabric, { manifest, handlers: createHandlers({ pi, fabric }) });\n\n  pi.registerCommand("${command}", {\n    description: "Invoke ${spec.nodeId}.${spec.provideName}.",\n    handler: async (args: string) => {\n      const result = await fabric.invoke({ nodeId: "${spec.nodeId}", provide: "${spec.provideName}", input: { request: args.trim() } });\n      if (!result.ok) throw new Error(result.error.message);\n      pi.sendMessage?.({ customType: "${spec.nodeId}.command_result", content: JSON.stringify(result.output, null, 2), display: true });\n    },\n  });\n}\n`;
}

function renderHandlers(spec: GeneratedPackageSpec): string {
  return `import type { ProtocolFabric, ProtocolHandler } from "@kyvernitria/pi-protocol-minimal";\n\nexport interface CreateHandlersOptions {\n  fabric?: ProtocolFabric;\n}\n\nexport function createHandlers(_options: CreateHandlersOptions = {}): Record<string, ProtocolHandler> {\n  return {\n    ${spec.handlerName}: async (input: unknown) => {\n      const request = typeof input === "object" && input !== null && "request" in input ? String((input as { request?: unknown }).request ?? "") : "";\n      return { summary: request ? "Handled: " + request : "Handled request." };\n    },\n  };\n}\n`;
}

function renderReadme(spec: GeneratedPackageSpec): string {
  return `# ${spec.packageName}\n\n${spec.purpose}\n\n## Protocol usage\n\nInvoke \`${spec.nodeId}.${spec.provideName}\` through the shared protocol fabric with input \`{ "request": "..." }\`.\n\n## Slash command\n\n\`/${spec.slashCommandName ?? `${spec.nodeId}.${spec.provideName}`} <request>\`\n\n## Contract\n\nThis package uses pi-protocol 0.2.0, canonical handler execution, and reload-friendly unregister/register bootstrapping.\n`;
}

export function renderJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_$]/g, "_").replace(/^[^a-zA-Z_$]/, "_$&");
}
