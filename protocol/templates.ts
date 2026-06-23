import type { GeneratedPackageSpec } from "./schemas.ts";
import type { RequestAnalysis } from "./request-analysis.ts";

export interface GeneratedPackageFiles {
  files: Record<string, string>;
}

export function renderGeneratedPackage(spec: GeneratedPackageSpec): GeneratedPackageFiles {
  return renderSimpleHandlerPackage(spec);
}

export function renderPackageForAnalysis(analysis: RequestAnalysis, request: string): GeneratedPackageFiles | undefined {
  if (analysis.family === "markdown_summarizer") return renderMarkdownSummarizer(analysis, request);
  if (analysis.family === "custom_pi_extension") return renderCustomPiExtension(analysis, request);
  if (analysis.family === "project_review_agent") return renderProjectReviewAgent(analysis, request);
  if (analysis.family === "simple_handler") {
    return renderSimpleHandlerPackage({
      packageName: analysis.packageName,
      nodeId: analysis.nodeId,
      purpose: `Handler-backed protocol package for: ${request.slice(0, 140)}`,
      provideName: analysis.provideName,
      provideDescription: `Handle ${analysis.provideName.replaceAll("_", " ")} requests.`,
      handlerName: analysis.provideName,
      slashCommandName: `${analysis.nodeId}.${analysis.provideName}`,
    });
  }
  return undefined;
}

function basePackageJson(name: string): unknown {
  return {
    name,
    version: "0.1.0",
    type: "module",
    exports: "./extension.ts",
    scripts: { typecheck: "tsc --noEmit" },
    pi: { extensions: ["./extension.ts"] },
    dependencies: { "@kyvernitria/pi-protocol-minimal": "^0.2.0" },
    peerDependencies: { "@earendil-works/pi-coding-agent": "*" },
    peerDependenciesMeta: { "@earendil-works/pi-coding-agent": { optional: true } },
    devDependencies: { typescript: "^5.9.3", "@types/node": "^24.5.2" },
  };
}

function manifest(analysis: RequestAnalysis, purpose: string, provide: Record<string, unknown>): unknown {
  return {
    protocolVersion: "0.2.0",
    nodeId: analysis.nodeId,
    packageId: analysis.packageName,
    version: "0.1.0",
    purpose,
    provides: [provide],
  };
}

function renderCommonExtension(analysis: RequestAnalysis, commandInput = "{ request: args.trim() }"): string {
  return `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";\nimport { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";\nimport manifestJson from "./pi.protocol.json" with { type: "json" };\nimport { createHandlers } from "./protocol/handlers.ts";\n\nconst manifest = manifestJson as PiProtocolManifest;\n\nexport default function ${toIdentifier(analysis.nodeId)}Extension(pi: ExtensionAPI): void {\n  const fabric = ensureProtocolFabric();\n  fabric.unregister("${analysis.nodeId}");\n  registerProtocolManifest(fabric, { manifest, handlers: createHandlers({ pi, fabric }) });\n\n  pi.registerCommand("${analysis.nodeId}.${analysis.provideName}", {\n    description: "Invoke ${analysis.nodeId}.${analysis.provideName}.",\n    handler: async (args: string) => {\n      const result = await fabric.invoke({ nodeId: "${analysis.nodeId}", provide: "${analysis.provideName}", input: ${commandInput} });\n      if (!result.ok) throw new Error(result.error.message);\n      pi.sendMessage?.({ customType: "${analysis.nodeId}.command_result", content: JSON.stringify(result.output, null, 2), display: true });\n    },\n  });\n}\n`;
}

function renderMarkdownSummarizer(analysis: RequestAnalysis, request: string): GeneratedPackageFiles {
  const provide = {
    name: analysis.provideName,
    description: "Summarize markdown text or a markdown file path.",
    inputSchema: {
      type: "object",
      properties: { filePath: { type: "string" }, markdown: { type: "string" }, maxSentences: { type: "integer" } },
    },
    outputSchema: {
      type: "object",
      required: ["summary"],
      properties: { summary: { type: "string" }, source: { type: "string" }, headings: { type: "array", items: { type: "string" } } },
    },
    execution: { type: "handler", handler: analysis.provideName },
    effects: ["file_read"],
  };
  return { files: {
    "package.json": renderJson(basePackageJson(analysis.packageName)),
    "pi.protocol.json": renderJson(manifest(analysis, "Summarize markdown files through pi-protocol.", provide)),
    "extension.ts": renderCommonExtension(analysis, "args.trim().startsWith('{') ? JSON.parse(args) : { filePath: args.trim() }"),
    "protocol/handlers.ts": `import { promises as fs } from "node:fs";\nimport type { ProtocolFabric, ProtocolHandler } from "@kyvernitria/pi-protocol-minimal";\n\nexport interface CreateHandlersOptions { fabric?: ProtocolFabric }\n\ninterface SummarizeInput { filePath?: string; markdown?: string; maxSentences?: number }\n\nexport function createHandlers(_options: CreateHandlersOptions = {}): Record<string, ProtocolHandler> {\n  return { ${analysis.provideName}: summarizeMarkdown };\n}\n\nasync function summarizeMarkdown(input: unknown): Promise<{ summary: string; source: string; headings: string[] }> {\n  const value = normalizeInput(input);\n  const markdown = value.markdown ?? await fs.readFile(requireFilePath(value.filePath), "utf8");\n  const headings = [...markdown.matchAll(/^#{1,6}\\s+(.+)$/gm)].map((match) => match[1]?.trim() ?? "").filter(Boolean);\n  const body = markdown\n    .replace(/^#{1,6}\\s+/gm, "")\n    .replace(/\\[[^\\]]+\\]\\([^)]+\\)/g, (match) => match.replace(/^\\[|\\]\\([^)]+\\)$/g, ""))\n    .replace(/[\`*_>#-]/g, " ")\n    .replace(/\\s+/g, " ")\n    .trim();\n  const sentences = body.split(/(?<=[.!?])\\s+/).filter(Boolean).slice(0, Math.max(1, value.maxSentences ?? 3));\n  const summary = sentences.join(" ") || (headings.length ? \`Markdown document with headings: \${headings.join(", ")}\` : "Markdown file is empty or contains no prose to summarize.");\n  return { summary, source: value.markdown ? "inline_markdown" : "file", headings };\n}\n\nfunction normalizeInput(input: unknown): SummarizeInput {\n  if (!input || typeof input !== "object") throw new Error("summarize_markdown input must include markdown or filePath");\n  const value = input as SummarizeInput;\n  if (!value.markdown && !value.filePath) throw new Error("Provide markdown text or filePath");\n  return value;\n}\n\nfunction requireFilePath(filePath: string | undefined): string {\n  if (!filePath?.trim()) throw new Error("filePath is required when markdown is not supplied");\n  return filePath;\n}\n`,
    "README.md": `# ${analysis.packageName}\n\nGenerated for: ${request}\n\nProvides \`${analysis.nodeId}.${analysis.provideName}\` to summarize inline markdown or markdown files.\n\nExample input: \`{ "filePath": "README.md", "maxSentences": 3 }\`.\n`,
  }};
}

function renderCustomPiExtension(analysis: RequestAnalysis, request: string): GeneratedPackageFiles {
  const provide = {
    name: "flash",
    description: "Flash a lightning notification in the Pi terminal/UI.",
    inputSchema: { type: "object", properties: { message: { type: "string" }, count: { type: "integer" } } },
    outputSchema: { type: "object", required: ["flashed", "message"], properties: { flashed: { type: "boolean" }, message: { type: "string" } } },
    execution: { type: "handler", handler: "flash" },
    effects: ["terminal_output"],
  };
  const a = { ...analysis, provideName: "flash" };
  return { files: {
    "package.json": renderJson(basePackageJson(analysis.packageName)),
    "pi.protocol.json": renderJson(manifest(a, "Flash lightning in the terminal when agent requests complete.", provide)),
    "extension.ts": `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";\nimport { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";\nimport manifestJson from "./pi.protocol.json" with { type: "json" };\nimport { createHandlers } from "./protocol/handlers.ts";\n\nconst manifest = manifestJson as PiProtocolManifest;\nconst NODE_ID = "${analysis.nodeId}";\n\nexport default function ${toIdentifier(analysis.nodeId)}Extension(pi: ExtensionAPI): void {\n  const fabric = ensureProtocolFabric();\n  fabric.unregister(NODE_ID);\n  registerProtocolManifest(fabric, { manifest, handlers: createHandlers({ pi, fabric }) });\n\n  pi.on?.("agent_end", async () => {\n    await fabric.invoke({ nodeId: NODE_ID, provide: "flash", input: { message: "⚡ lightning: agent request complete", count: 3 } });\n  });\n\n  pi.registerCommand("${analysis.nodeId}.flash", {\n    description: "Flash lightning in the terminal.",\n    handler: async (args: string) => {\n      const result = await fabric.invoke({ nodeId: NODE_ID, provide: "flash", input: { message: args.trim() || "⚡ lightning", count: 3 } });\n      if (!result.ok) throw new Error(result.error.message);\n    },\n  });\n}\n`,
    "protocol/handlers.ts": `import type { ProtocolFabric, ProtocolHandler } from "@kyvernitria/pi-protocol-minimal";\n\ntype MessageSink = { sendMessage?: (message: { customType: string; content: string; display: boolean }) => void };\n\nexport interface CreateHandlersOptions { pi?: MessageSink; fabric?: ProtocolFabric }\n\nexport function createHandlers(options: CreateHandlersOptions = {}): Record<string, ProtocolHandler> {\n  return { flash: async (input: unknown) => flashLightning(input, options.pi) };\n}\n\nasync function flashLightning(input: unknown, pi?: MessageSink): Promise<{ flashed: boolean; message: string }> {\n  const value = input && typeof input === "object" ? input as { message?: unknown; count?: unknown } : {};\n  const message = typeof value.message === "string" && value.message.trim() ? value.message : "⚡ lightning";\n  const count = typeof value.count === "number" ? Math.max(1, Math.min(10, Math.floor(value.count))) : 3;\n  const frames = Array.from({ length: count }, (_, index) => \`\\x1b[33m⚡ lightning \${index + 1}/\${count}: \${message}\\x1b[0m\`);\n  for (const frame of frames) console.error(frame);\n  pi?.sendMessage?.({ customType: "${analysis.nodeId}.lightning", content: frames.join("\\n"), display: true });\n  return { flashed: true, message };\n}\n`,
    "README.md": `# ${analysis.packageName}\n\nGenerated for: ${request}\n\nListens for the Pi \`agent_end\` hook and invokes \`${analysis.nodeId}.flash\` to display lightning. Also exposes the protocol \`flash\` provide and slash command \`/${analysis.nodeId}.flash\`.\n`,
  }};
}

function renderProjectReviewAgent(analysis: RequestAnalysis, request: string): GeneratedPackageFiles {
  const provide = {
    name: analysis.provideName,
    description: "Review a project task and return concise risks and next steps.",
    inputSchema: { type: "string" },
    outputSchema: { type: "string" },
    execution: { type: "agent", agent: "project_reviewer" },
  };
  const m = manifest(analysis, "Project/task review agent package.", provide) as Record<string, unknown>;
  m.agents = { project_reviewer: { description: "Concise project/task reviewer.", systemPrompt: { text: "Review the provided project task concisely. Return Summary, Risks, Next Steps.", mode: "append" } } };
  return { files: {
    "package.json": renderJson({ ...(basePackageJson(analysis.packageName) as object), dependencies: { "@kyvernitria/pi-protocol-minimal": "^0.2.0", "@kyvernitria/pi-protocol-pi-sdk": "^0.2.0" } }),
    "pi.protocol.json": renderJson(m),
    "extension.ts": `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";\nimport { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";\nimport { createPiSdkAgentExecutorsFromManifest } from "@kyvernitria/pi-protocol-pi-sdk/agent-session";\nimport manifestJson from "./pi.protocol.json" with { type: "json" };\n\nconst manifest = manifestJson as PiProtocolManifest;\n\nexport default function ${toIdentifier(analysis.nodeId)}Extension(_pi: ExtensionAPI): void {\n  const fabric = ensureProtocolFabric();\n  fabric.unregister("${analysis.nodeId}");\n  registerProtocolManifest(fabric, { manifest, agentExecutors: createPiSdkAgentExecutorsFromManifest(manifest, { toPrompt: (input) => String(input), toOutput: (text) => text.trim() }) });\n}\n`,
    "README.md": `# ${analysis.packageName}\n\nGenerated for: ${request}\n\nAgent-backed protocol package exposing \`${analysis.nodeId}.${analysis.provideName}\`.\n`,
  }};
}

function renderSimpleHandlerPackage(spec: GeneratedPackageSpec): GeneratedPackageFiles {
  const analysis: RequestAnalysis = { family: "simple_handler", packageName: spec.packageName, nodeId: spec.nodeId, provideName: spec.provideName, reason: "simple handler" };
  const provide = { name: spec.provideName, description: spec.provideDescription, inputSchema: { type: "object", required: ["request"], properties: { request: { type: "string" } } }, outputSchema: { type: "object", required: ["summary"], properties: { summary: { type: "string" } } }, execution: { type: "handler", handler: spec.handlerName } };
  return { files: {
    "package.json": renderJson(basePackageJson(spec.packageName)),
    "pi.protocol.json": renderJson(manifest(analysis, spec.purpose, provide)),
    "extension.ts": renderCommonExtension(analysis),
    "protocol/handlers.ts": `import type { ProtocolHandler } from "@kyvernitria/pi-protocol-minimal";\n\nexport function createHandlers(): Record<string, ProtocolHandler> {\n  return { ${spec.handlerName}: async (input: unknown) => ({ summary: String((input as { request?: unknown })?.request ?? "") }) };\n}\n`,
    "README.md": renderReadme(spec),
  }};
}

function renderReadme(spec: GeneratedPackageSpec): string {
  return `# ${spec.packageName}\n\n${spec.purpose}\n\nInvoke \`${spec.nodeId}.${spec.provideName}\` through the shared protocol fabric.\n`;
}

export function renderJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_$]/g, "_").replace(/^[^a-zA-Z_$]/, "_$&");
}
