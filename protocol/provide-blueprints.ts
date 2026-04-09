import { toPascalCase } from "./core-shared.ts";
import type { ScaffoldProvideInput } from "./contracts.ts";
import type { JSONSchemaLite } from "../vendor/pi-protocol-sdk.ts";

export type InferredProvideKind =
  | "ping"
  | "summarize_url"
  | "summarize"
  | "search"
  | "validate"
  | "extract_tasks"
  | "answer"
  | "classify"
  | "configure_package_loading"
  | "generic";

export interface ProvideBlueprintDef {
  kind: InferredProvideKind;
  matchesBrief: (brief: string) => boolean;
  inferName: (brief: string) => string;
  inferDescription: (brief: string) => string;
  inputSchema: JSONSchemaLite;
  outputSchema: JSONSchemaLite;
  handlerStub: (provide: ScaffoldProvideInput) => string;
  suppressKinds?: InferredProvideKind[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function mentionsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function isValidationIntent(value: string): boolean {
  return (
    mentionsAny(value, ["validate", "validation", "verify", "lint", "compliance", "conformance"]) ||
    (mentionsAny(value, ["check", "checks", "checking"]) &&
      mentionsAny(value, ["package", "repo", "repository", "manifest", "schema", "types", "wiring", "bootstrap", "compliance"]))
  );
}

function cloneSchema<TSchema extends JSONSchemaLite>(schema: TSchema): TSchema {
  return JSON.parse(JSON.stringify(schema)) as TSchema;
}

const PING_BLUEPRINT: ProvideBlueprintDef = {
  kind: "ping",
  matchesBrief: (brief) => mentionsAny(brief, ["ping", "pong", "heartbeat", "healthcheck", "health check", "smoke test"]),
  inferName: () => "ping",
  inferDescription: () => "Return a simple pong response for protocol alignment or smoke-test checks.",
  inputSchema: {
    type: "object",
    properties: {
      note: { type: "string", description: "Optional caller note to echo back with the pong response." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["status", "provide", "nodeId", "response"],
    properties: {
      status: { type: "string", enum: ["ok"], description: "Ping completed successfully." },
      provide: { type: "string", description: "The provide that produced the response." },
      nodeId: { type: "string", description: "The current callee nodeId." },
      response: { type: "string", enum: ["pong"], description: "Canonical ping response." },
      echoedNote: { type: "string", description: "Optional caller note echoed back by the starter handler." },
    },
  },
  handlerStub: (provide) => {
    const baseName = toPascalCase(provide.name);
    return `interface ${baseName}Input {
  note?: string;
}

interface ${baseName}Output {
  status: "ok";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  response: "pong";
  echoedNote?: string;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  return {
    status: "ok",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    response: "pong",
    echoedNote: typeof input.note === "string" ? input.note : undefined,
  };
};`;
  },
};

const SUMMARIZE_URL_BLUEPRINT: ProvideBlueprintDef = {
  kind: "summarize_url",
  suppressKinds: ["summarize"],
  matchesBrief: (brief) =>
    mentionsAny(brief, ["url", "urls", "website", "webpage", "web page", "link", "article", "page"]) &&
    mentionsAny(brief, ["summary", "summarize", "summarise", "content", "contents"]),
  inferName: () => "summarize_url",
  inferDescription: () => "Fetch a URL, extract readable text, and summarize the page content into a typed protocol response.",
  inputSchema: {
    type: "object",
    required: ["url"],
    properties: {
      url: { type: "string", description: "URL to fetch and summarize." },
      maxSentences: { type: "integer", description: "Optional upper bound for the summary length." },
      note: { type: "string", description: "Optional caller note or summary guidance." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["status", "provide", "nodeId", "url", "summary", "sourceCount"],
    properties: {
      status: { type: "string", enum: ["ok"], description: "URL summary completed successfully." },
      provide: { type: "string", description: "The provide that produced the response." },
      nodeId: { type: "string", description: "The current callee nodeId." },
      url: { type: "string", description: "The URL that was summarized." },
      title: { type: "string", description: "Optional page title extracted from the URL." },
      summary: { type: "string", description: "Concise summary of the fetched page content." },
      sourceCount: { type: "number", description: "Count of sources inspected." },
    },
  },
  handlerStub: (provide) => {
    const baseName = toPascalCase(provide.name);
    return `interface ${baseName}Input {
  url: string;
  maxSentences?: number;
  note?: string;
}

interface ${baseName}Output {
  status: "ok";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  url: string;
  title?: string;
  summary: string;
  sourceCount: number;
}

function stripUrlHtml(html: string): string {
  return html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<style[\\s\\S]*?<\\/style>/gi, " ")
    .replace(/<noscript[\\s\\S]*?<\\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\s+/g, " ")
    .trim();
}

function summarizeUrlText(text: string, maxSentences: number): string {
  const sentences = text
    .split(/(?<=[.!?])\\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const clipped = sentences.slice(0, Math.max(1, maxSentences));
  return clipped.join(" ").slice(0, 1000);
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  const response = await fetch(input.url, {
    headers: {
      "user-agent": "pi-protocol-url-summarizer/1.0",
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch ' + input.url + ': ' + response.status + ' ' + response.statusText);
  }

  const html = await response.text();
  const title = html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i)?.[1]?.trim();
  const readableText = stripUrlHtml(html);
  const maxSentences = Number.isFinite(input.maxSentences) && (input.maxSentences ?? 0) > 0 ? Math.floor(input.maxSentences ?? 3) : 3;
  const summary = summarizeUrlText(readableText, maxSentences);

  return {
    status: "ok",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    url: input.url,
    title: title || undefined,
    summary,
    sourceCount: readableText ? 1 : 0,
  };
};`;
  },
};

const SUMMARIZE_BLUEPRINT: ProvideBlueprintDef = {
  kind: "summarize",
  matchesBrief: (brief) => mentionsAny(brief, ["summary", "summarize", "summarise"]),
  inferName: (brief) => mentionsAny(brief, ["markdown", "notes", "docs", "documents"]) ? "summarize_notes" : "summarize_content",
  inferDescription: (brief) =>
    mentionsAny(brief, ["markdown", "notes", "docs", "documents"])
      ? "Summarize markdown notes or similar workspace text into a typed protocol response."
      : "Summarize supplied content into a typed protocol response.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Direct content to summarize." },
      paths: { type: "array", items: { type: "string" }, description: "Optional file or workspace paths to summarize." },
      maxSentences: { type: "integer", description: "Optional upper bound for the summary length." },
      note: { type: "string", description: "Optional caller note or summary guidance." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["status", "provide", "nodeId", "summary", "sourceCount"],
    properties: {
      status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
      provide: { type: "string", description: "The provide that produced the response." },
      nodeId: { type: "string", description: "The current callee nodeId." },
      summary: { type: "string", description: "Starter summary output." },
      sourceCount: { type: "number", description: "Count of text/path sources considered." },
    },
  },
  handlerStub: (provide) => {
    const baseName = toPascalCase(provide.name);
    return `interface ${baseName}Input {
  text?: string;
  paths?: string[];
  maxSentences?: number;
  note?: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  summary: string;
  sourceCount: number;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  const sourceText = typeof input.text === "string" ? input.text.trim() : "";
  const paths = Array.isArray(input.paths) ? input.paths.filter((value): value is string => typeof value === "string") : [];
  const preview =
    sourceText ||
    (typeof input.note === "string" ? input.note.trim() : "") ||
    (paths.length > 0 ? "from " + paths.length + " path(s)" : "no source text provided");

  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    summary: "todo: summarize " + preview.slice(0, 160),
    sourceCount: paths.length + (sourceText ? 1 : 0),
  };
};`;
  },
};

const SEARCH_BLUEPRINT: ProvideBlueprintDef = {
  kind: "search",
  matchesBrief: (brief) => mentionsAny(brief, ["search", "find", "lookup", "grep", "research", "investigate"]),
  inferName: (brief) => mentionsAny(brief, ["markdown", "notes", "docs", "documents"]) ? "search_notes" : "search_content",
  inferDescription: (brief) =>
    mentionsAny(brief, ["markdown", "notes", "docs", "documents"])
      ? "Search workspace notes or docs and return typed matches."
      : "Search supplied content sources and return typed matches.",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "Search query." },
      paths: { type: "array", items: { type: "string" }, description: "Optional file or workspace paths to search." },
      limit: { type: "integer", description: "Maximum number of matches to return." },
      note: { type: "string", description: "Optional caller note or search hint." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["status", "provide", "nodeId", "query", "matches", "total"],
    properties: {
      status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
      provide: { type: "string", description: "The provide that produced the response." },
      nodeId: { type: "string", description: "The current callee nodeId." },
      query: { type: "string", description: "Normalized query used by the search." },
      matches: {
        type: "array",
        items: {
          type: "object",
          required: ["path", "snippet"],
          properties: {
            path: { type: "string" },
            snippet: { type: "string" },
          },
        },
        description: "Starter match results.",
      },
      total: { type: "number", description: "Total number of matches returned." },
    },
  },
  handlerStub: (provide) => {
    const baseName = toPascalCase(provide.name);
    return `interface ${baseName}Input {
  query: string;
  paths?: string[];
  limit?: number;
  note?: string;
}

interface ${baseName}Match {
  path: string;
  snippet: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  query: string;
  matches: ${baseName}Match[];
  total: number;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    query: input.query,
    matches: [],
    total: 0,
  };
};`;
  },
};

const VALIDATE_BLUEPRINT: ProvideBlueprintDef = {
  kind: "validate",
  matchesBrief: (brief) => isValidationIntent(brief),
  inferName: (brief) => mentionsAny(brief, ["repo", "repository"]) ? "validate_repo" : "validate_package",
  inferDescription: (brief) =>
    mentionsAny(brief, ["repo", "repository"])
      ? "Validate a repository request and return typed findings."
      : "Validate a target package or repo request and return a typed assessment.",
  inputSchema: {
    type: "object",
    required: ["targetPath"],
    properties: {
      targetPath: { type: "string", description: "Target path or package to validate." },
      note: { type: "string", description: "Optional caller note or validation scope." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["status", "provide", "nodeId", "pass", "findings"],
    properties: {
      status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
      provide: { type: "string", description: "The provide that produced the response." },
      nodeId: { type: "string", description: "The current callee nodeId." },
      pass: { type: "boolean", description: "Starter validation verdict." },
      findings: {
        type: "array",
        items: {
          type: "object",
          required: ["level", "message"],
          properties: {
            level: { type: "string", enum: ["info", "warning", "error"] },
            message: { type: "string" },
          },
        },
        description: "Starter validation findings.",
      },
    },
  },
  handlerStub: (provide) => {
    const baseName = toPascalCase(provide.name);
    return `interface ${baseName}Input {
  targetPath: string;
  note?: string;
}

interface ${baseName}Finding {
  level: "info" | "warning" | "error";
  message: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  pass: boolean;
  findings: ${baseName}Finding[];
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    pass: false,
    findings: [
      {
        level: "info",
        message: "todo: validate " + input.targetPath,
      },
    ],
  };
};`;
  },
};

const EXTRACT_TASKS_BLUEPRINT: ProvideBlueprintDef = {
  kind: "extract_tasks",
  matchesBrief: (brief) => mentionsAny(brief, ["todo", "todos", "task list", "tasks", "action items", "extract task"]),
  inferName: () => "extract_tasks",
  inferDescription: () => "Extract actionable tasks or TODO items into a typed protocol response.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Direct content to inspect for tasks." },
      paths: { type: "array", items: { type: "string" }, description: "Optional file or workspace paths to inspect." },
      includeCompleted: { type: "boolean", description: "Whether completed tasks should remain in the output." },
      note: { type: "string", description: "Optional caller note or extraction hint." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["status", "provide", "nodeId", "tasks", "sourceCount"],
    properties: {
      status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
      provide: { type: "string", description: "The provide that produced the response." },
      nodeId: { type: "string", description: "The current callee nodeId." },
      tasks: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "completed"],
          properties: {
            title: { type: "string" },
            completed: { type: "boolean" },
          },
        },
        description: "Starter extracted tasks.",
      },
      sourceCount: { type: "number", description: "Count of sources inspected." },
    },
  },
  handlerStub: (provide) => {
    const baseName = toPascalCase(provide.name);
    return `interface ${baseName}Input {
  text?: string;
  paths?: string[];
  includeCompleted?: boolean;
  note?: string;
}

interface ${baseName}Task {
  title: string;
  completed: boolean;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  tasks: ${baseName}Task[];
  sourceCount: number;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  const paths = Array.isArray(input.paths) ? input.paths.filter((value): value is string => typeof value === "string") : [];
  const sourceCount = paths.length + (typeof input.text === "string" && input.text.trim().length > 0 ? 1 : 0);

  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    tasks: [],
    sourceCount,
  };
};`;
  },
};

const ANSWER_BLUEPRINT: ProvideBlueprintDef = {
  kind: "answer",
  matchesBrief: (brief) => mentionsAny(brief, ["question", "questions", "answer", "q&a", "qa"]),
  inferName: (brief) => mentionsAny(brief, ["markdown", "notes", "docs", "documents"]) ? "answer_questions" : "answer_question",
  inferDescription: (brief) =>
    mentionsAny(brief, ["markdown", "notes", "docs", "documents"])
      ? "Answer questions against notes or docs and return typed citations."
      : "Answer a supplied question and return a typed response.",
  inputSchema: {
    type: "object",
    required: ["question"],
    properties: {
      question: { type: "string", description: "Question to answer." },
      contextPaths: { type: "array", items: { type: "string" }, description: "Optional file or workspace paths that constrain the answer." },
      note: { type: "string", description: "Optional caller note or answer guidance." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["status", "provide", "nodeId", "answer"],
    properties: {
      status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
      provide: { type: "string", description: "The provide that produced the response." },
      nodeId: { type: "string", description: "The current callee nodeId." },
      answer: { type: "string", description: "Starter answer output." },
      citations: {
        type: "array",
        items: {
          type: "object",
          required: ["path", "quote"],
          properties: {
            path: { type: "string" },
            quote: { type: "string" },
          },
        },
        description: "Optional supporting citations.",
      },
    },
  },
  handlerStub: (provide) => {
    const baseName = toPascalCase(provide.name);
    return `interface ${baseName}Input {
  question: string;
  contextPaths?: string[];
  note?: string;
}

interface ${baseName}Citation {
  path: string;
  quote: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  answer: string;
  citations?: ${baseName}Citation[];
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    answer: "todo: answer " + input.question,
    citations: [],
  };
};`;
  },
};

const CLASSIFY_BLUEPRINT: ProvideBlueprintDef = {
  kind: "classify",
  matchesBrief: (brief) => mentionsAny(brief, ["classify", "classification", "categorize", "categorise", "tagging", "tag text"]),
  inferName: () => "classify_text",
  inferDescription: () => "Classify supplied text into typed categories.",
  inputSchema: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", description: "Text to classify." },
      labels: { type: "array", items: { type: "string" }, description: "Optional allowed labels for classification." },
      note: { type: "string", description: "Optional caller note or classification hint." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["status", "provide", "nodeId", "label", "confidence"],
    properties: {
      status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
      provide: { type: "string", description: "The provide that produced the response." },
      nodeId: { type: "string", description: "The current callee nodeId." },
      label: { type: "string", description: "Starter classification label." },
      confidence: { type: "number", description: "Starter confidence score between 0 and 1." },
    },
  },
  handlerStub: (provide) => {
    const baseName = toPascalCase(provide.name);
    return `interface ${baseName}Input {
  text: string;
  labels?: string[];
  note?: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  label: string;
  confidence: number;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  const fallbackLabel = Array.isArray(input.labels) && input.labels.length > 0 ? input.labels[0] : "unclassified";

  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    label: fallbackLabel,
    confidence: 0,
  };
};`;
  },
};

const CONFIGURE_PACKAGE_LOADING_BLUEPRINT: ProvideBlueprintDef = {
  kind: "configure_package_loading",
  matchesBrief: (brief) =>
    (brief.includes("configure_package_loading") ||
      mentionsAny(brief, ["package loading", "next-session", "next session", "project settings", "global settings", "reload recommended"])) &&
    mentionsAny(brief, ["package", "packages", "loading", "settings", "reload"]),
  inferName: () => "configure_package_loading",
  inferDescription: () => "Compute and optionally apply next-session package loading changes by editing project or global Pi settings.",
  inputSchema: {
    type: "object",
    properties: {
      roots: { type: "array", items: { type: "string" }, description: "Roots to scan for candidate Pi packages." },
      scope: { type: "string", description: "Settings scope to update, e.g. project or global." },
      applyChanges: { type: "boolean", description: "Whether to write the proposed settings changes." },
      reloadAfterApply: { type: "boolean", description: "Whether reload should be requested after changes are written." },
      note: { type: "string", description: "Optional caller note or policy constraint." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["status", "provide", "nodeId", "discoveredPackages", "enabledPackages", "disabledPackages", "reloadRecommended", "activationBoundary"],
    properties: {
      status: { type: "string", description: "Starter configuration status." },
      provide: { type: "string", description: "The provide that produced the response." },
      nodeId: { type: "string", description: "The current callee nodeId." },
      settingsPath: { type: "string", description: "Settings file that would be updated or was updated." },
      discoveredPackages: { type: "array", items: { type: "string" }, description: "Candidate package roots discovered during the scan." },
      enabledPackages: { type: "array", items: { type: "string" }, description: "Package roots enabled in the proposed or applied config." },
      disabledPackages: { type: "array", items: { type: "string" }, description: "Package roots disabled in the proposed or applied config." },
      reloadRecommended: { type: "boolean", description: "Whether a manual reload is recommended after applying changes." },
      activationBoundary: { type: "string", description: "Statement describing when the config takes effect." },
    },
  },
  handlerStub: (provide) => {
    const baseName = toPascalCase(provide.name);
    return `interface ${baseName}Input {
  roots?: string[];
  scope?: string;
  applyChanges?: boolean;
  reloadAfterApply?: boolean;
  note?: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  settingsPath?: string;
  discoveredPackages: string[];
  enabledPackages: string[];
  disabledPackages: string[];
  reloadRecommended: boolean;
  activationBoundary: string;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  const roots = Array.isArray(input.roots) ? input.roots.filter((value): value is string => typeof value === "string") : [];
  const scope = typeof input.scope === "string" && input.scope.trim() ? input.scope.trim() : "project";

  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    settingsPath: scope === "global" ? "~/.pi/agent/settings.json" : ".pi/settings.json",
    discoveredPackages: roots,
    enabledPackages: input.applyChanges ? roots : [],
    disabledPackages: [],
    reloadRecommended: input.applyChanges !== false,
    activationBoundary: "Changes apply only after manual /reload or next session startup.",
  };
};`;
  },
};

const GENERIC_BLUEPRINT: ProvideBlueprintDef = {
  kind: "generic",
  matchesBrief: () => true,
  inferName: () => "handle_request",
  inferDescription: (brief) => `Handle the described capability from the brief: ${normalizeWhitespace(brief).slice(0, 120)}.`,
  inputSchema: {
    type: "object",
    properties: {
      note: { type: "string", description: "Optional starter input note." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["status", "provide", "nodeId"],
    properties: {
      status: { type: "string", enum: ["todo"], description: "Starter status returned by the scaffolded handler." },
      provide: { type: "string", description: "The provide that produced the response." },
      nodeId: { type: "string", description: "The current callee nodeId." },
      receivedNote: { type: "string", description: "Optional note echoed from the input." },
    },
  },
  handlerStub: (provide) => {
    const baseName = toPascalCase(provide.name);
    return `interface ${baseName}Input {
  note?: string;
}

interface ${baseName}Output {
  status: "todo";
  provide: ${JSON.stringify(provide.name)};
  nodeId: string;
  receivedNote?: string;
}

export const ${provide.name}: ProtocolHandler<${baseName}Input, ${baseName}Output> = async (ctx, input) => {
  return {
    status: "todo",
    provide: ${JSON.stringify(provide.name)},
    nodeId: ctx.calleeNodeId,
    receivedNote: typeof input.note === "string" ? input.note : undefined,
  };
};`;
  },
};

const PROVIDE_BLUEPRINT_REGISTRY: ProvideBlueprintDef[] = [
  CONFIGURE_PACKAGE_LOADING_BLUEPRINT,
  PING_BLUEPRINT,
  SUMMARIZE_URL_BLUEPRINT,
  SUMMARIZE_BLUEPRINT,
  SEARCH_BLUEPRINT,
  VALIDATE_BLUEPRINT,
  EXTRACT_TASKS_BLUEPRINT,
  ANSWER_BLUEPRINT,
  CLASSIFY_BLUEPRINT,
  GENERIC_BLUEPRINT,
];

export function getProvideBlueprintRegistry(): ProvideBlueprintDef[] {
  return PROVIDE_BLUEPRINT_REGISTRY;
}

function getProvideBlueprintByKind(kind: InferredProvideKind): ProvideBlueprintDef {
  return PROVIDE_BLUEPRINT_REGISTRY.find((blueprint) => blueprint.kind === kind) ?? GENERIC_BLUEPRINT;
}

export function detectCapabilityKindsFromBrief(brief: string): InferredProvideKind[] {
  const normalized = brief.toLowerCase();
  const matchedBlueprints = PROVIDE_BLUEPRINT_REGISTRY
    .filter((blueprint) => blueprint.kind !== "generic")
    .filter((blueprint) => blueprint.matchesBrief(normalized));
  const suppressedKinds = new Set(matchedBlueprints.flatMap((blueprint) => blueprint.suppressKinds ?? []));
  const detected = matchedBlueprints
    .map((blueprint) => blueprint.kind)
    .filter((kind) => !suppressedKinds.has(kind));

  return detected.length > 0 ? detected : ["generic"];
}

export function inferCandidateProvidesFromBrief(brief: string): ScaffoldProvideInput[] {
  const normalized = brief.toLowerCase();
  const kinds = detectCapabilityKindsFromBrief(normalized);
  const results: ScaffoldProvideInput[] = [];
  const seen = new Set<string>();

  for (const kind of kinds) {
    const blueprint = getProvideBlueprintByKind(kind);
    const name = blueprint.inferName(normalized);
    if (seen.has(name)) continue;
    seen.add(name);
    results.push({
      name,
      description: blueprint.inferDescription(normalized),
    });
  }

  return results.slice(0, 3);
}

export function inferProvideKind(provide: ScaffoldProvideInput): InferredProvideKind {
  const signature = `${provide.name} ${provide.description}`.toLowerCase();
  return (
    PROVIDE_BLUEPRINT_REGISTRY
      .filter((blueprint) => blueprint.kind !== "generic")
      .find((blueprint) => blueprint.matchesBrief(signature))?.kind ?? "generic"
  );
}

export function inferProvideBlueprint(provide: ScaffoldProvideInput): ProvideBlueprintDef {
  return getProvideBlueprintByKind(inferProvideKind(provide));
}

export function createStarterSchemas(provide: ScaffoldProvideInput): {
  inputSchema: JSONSchemaLite;
  outputSchema: JSONSchemaLite;
} {
  const blueprint = inferProvideBlueprint(provide);
  return {
    inputSchema: cloneSchema(blueprint.inputSchema),
    outputSchema: cloneSchema(blueprint.outputSchema),
  };
}
