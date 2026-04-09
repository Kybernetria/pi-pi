import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import {
  emitProtocolSubagentStarted,
  emitProtocolSubagentStatus,
  emitProtocolSubagentStream,
  type ProtocolSessionPi,
  type ProtocolSubagentEventBase,
  type ProtocolSubagentMessageCompletedEvent,
  type ProtocolSubagentMessageDeltaEvent,
  type ProtocolSubagentRunStatus,
  type ProtocolSubagentStartedEvent,
  type ProtocolSubagentStatusEvent,
  type ProtocolSubagentStreamEvent,
  type ProtocolSubagentToolEvent,
} from "../vendor/pi-protocol-sdk.ts";
import { getProtocolConversationSnapshot } from "./protocol-conversation.ts";

export interface ProtocolSubagentSessionLike {
  bindExtensions?: (...args: any[]) => Promise<void>;
  getAllTools?: () => Array<{ name: string }>;
  setActiveToolsByName?: (toolNames: string[]) => void;
}

export interface ProtocolSubagentBridgeOptions {
  projection: Pick<ProtocolSessionPi, "appendEntry" | "sendMessage">;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  nodeId: string;
  provide: string;
  conversationToken?: string;
  depth: number;
  label?: string;
  breadcrumb?: string[];
  emitStartedOnBind?: boolean;
  getState?: () => {
    traceId: string;
    parentSpanId?: string;
    depth: number;
    breadcrumb: string[];
    runId?: string;
    assistantMessagePolicy: ProtocolChildAssistantMessagePolicy;
  };
}

export interface ProtocolChildSessionVisibility {
  contextOpacity?: "opaque" | "transparent";
  uiVisibility?: "verbose" | "compact" | "hidden";
}

export type ProtocolChildAssistantMessagePolicy = "stream" | "final-only" | "hidden";

export type ProtocolChildSessionGuardrailCode =
  | "missing_required_tools"
  | "protocol_tool_unavailable"
  | "verbose_streaming_unavailable";

export interface ProtocolChildSessionGuardrailWarning extends ProtocolSubagentEventBase {
  kind: "subagent_warning";
  code: ProtocolChildSessionGuardrailCode;
  label?: string;
  breadcrumb?: string[];
  message: string;
  missingToolNames?: string[];
  requestedToolNames?: string[];
  availableToolNames?: string[];
  visibility?: {
    contextOpacity: "opaque" | "transparent";
    uiVisibility: "verbose" | "compact" | "hidden";
  };
}

export type ProtocolChildSessionStreamInput =
  | Pick<ProtocolSubagentMessageDeltaEvent, "kind" | "messageId" | "delta">
  | Pick<ProtocolSubagentMessageCompletedEvent, "kind" | "messageId" | "text">
  | Pick<ProtocolSubagentToolEvent, "kind" | "toolName" | "toolCallId" | "summary">;

export interface ProtocolChildSessionRuntimeOptions {
  projection?: Pick<ProtocolSessionPi, "appendEntry" | "sendMessage" | "getActiveTools" | "getAllTools">;
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  depth: number;
  nodeId: string;
  provide: string;
  conversationToken?: string;
  label?: string;
  breadcrumb?: string[];
  includeProtocolTool?: boolean;
  extraToolNames?: string[];
  assistantMessagePolicy?: ProtocolChildAssistantMessagePolicy;
  visibility?: ProtocolChildSessionVisibility;
  strict?: boolean;
}

export interface ProtocolChildSessionRuntime {
  readonly options: Readonly<ProtocolChildSessionRuntimeOptions>;
  readonly projection?: Pick<ProtocolSessionPi, "appendEntry" | "sendMessage" | "getActiveTools" | "getAllTools">;
  readonly spanId: string;
  readonly nodeId: string;
  readonly provide: string;
  readonly conversationToken?: string;
  readonly label: string;
  readonly assistantMessagePolicy: ProtocolChildAssistantMessagePolicy;
  readonly visibility: {
    contextOpacity: "opaque" | "transparent";
    uiVisibility: "verbose" | "compact" | "hidden";
  };
  readonly includeProtocolTool: boolean;
  readonly extraToolNames: string[];
  readonly extensionFactories: ExtensionFactory[];
  readonly strict: boolean;
  updateInvocation(invocation: {
    traceId?: string;
    parentSpanId?: string;
    depth?: number;
    breadcrumb?: string[];
  }): void;
  beginRun(invocation?: {
    traceId?: string;
    parentSpanId?: string;
    depth?: number;
    breadcrumb?: string[];
  }): string;
  endRun(runId?: string): void;
  emitStarted(summary?: string): void;
  emitStatus(
    status: ProtocolSubagentRunStatus,
    summary?: string,
    error?: {
      code?: string;
      message: string;
    },
  ): void;
  emitStream(event: ProtocolChildSessionStreamInput): void;
}

const PROTOCOL_CHILD_SESSION_REQUIRED_CORE_TOOLS = ["read", "write", "edit", "bash"] as const;
const PROTOCOL_CHILD_SESSION_BINDING_KEY = Symbol.for("pi-protocol.child-session.binding");

export function getProtocolInheritedToolNames(
  parent: Pick<ProtocolSessionPi, "getActiveTools" | "getAllTools"> | undefined,
  availableToolNames: Iterable<string>,
  options: { includeProtocolTool?: boolean; extraToolNames?: string[] } = {},
): string[] {
  const inherited = new Set<string>([
    ...(parent?.getActiveTools?.() ?? parent?.getAllTools?.().map((tool) => tool.name) ?? []),
    "read",
    "write",
    "edit",
    "bash",
    ...(options.includeProtocolTool ? ["protocol"] : []),
    ...(options.extraToolNames ?? []),
  ]);
  const available = new Set(availableToolNames);
  return [...inherited].filter((name) => available.has(name));
}

export async function applyProtocolInheritedTools(
  session: ProtocolSubagentSessionLike,
  parent: Pick<ProtocolSessionPi, "getActiveTools" | "getAllTools"> | undefined,
  options: { includeProtocolTool?: boolean; extraToolNames?: string[] } = {},
): Promise<string[]> {
  const availableToolNames = session.getAllTools?.().map((tool) => tool.name) ?? [];
  const toolNames = getProtocolInheritedToolNames(parent, availableToolNames, options);
  session.setActiveToolsByName?.(toolNames);
  return toolNames;
}

function normalizeProtocolChildAssistantMessagePolicy(
  assistantMessagePolicy: ProtocolChildSessionRuntimeOptions["assistantMessagePolicy"],
  projection: ProtocolChildSessionRuntimeOptions["projection"],
  visibility: {
    contextOpacity: "opaque" | "transparent";
    uiVisibility: "verbose" | "compact" | "hidden";
  },
): ProtocolChildAssistantMessagePolicy {
  if (assistantMessagePolicy === "stream" || assistantMessagePolicy === "final-only" || assistantMessagePolicy === "hidden") {
    return assistantMessagePolicy;
  }

  if (!projection || visibility.uiVisibility === "hidden") {
    return "hidden";
  }

  return "stream";
}

function normalizeProtocolChildSessionVisibility(
  visibility: ProtocolChildSessionVisibility | undefined,
  projection: ProtocolChildSessionRuntimeOptions["projection"],
): {
  contextOpacity: "opaque" | "transparent";
  uiVisibility: "verbose" | "compact" | "hidden";
} {
  return {
    contextOpacity: visibility?.contextOpacity === "transparent" ? "transparent" : "opaque",
    uiVisibility: visibility?.uiVisibility ?? (projection ? "verbose" : "hidden"),
  };
}

function normalizeProtocolChildSessionBreadcrumb(
  projection: ProtocolChildSessionRuntimeOptions["projection"],
  label: string,
  breadcrumb?: string[],
): string[] {
  if (breadcrumb?.length) {
    return [...breadcrumb];
  }

  if (!projection) {
    return ["main", label];
  }

  const inherited = [...getProtocolConversationSnapshot(projection).breadcrumb];
  if (inherited.at(-1) !== label) {
    inherited.push(label);
  }
  return inherited;
}

function appendProtocolChildSessionEvent(
  projection: Pick<ProtocolSessionPi, "appendEntry"> | undefined,
  event: unknown,
): void {
  projection?.appendEntry?.("protocol", event);
}

function emitProtocolChildSessionGuardrailWarning(
  projection: Pick<ProtocolSessionPi, "appendEntry"> | undefined,
  warning: ProtocolChildSessionGuardrailWarning,
): void {
  appendProtocolChildSessionEvent(projection, warning);
}

function throwProtocolChildSessionGuardrail(warning: ProtocolChildSessionGuardrailWarning): never {
  const error = new Error(`[${warning.code}] ${warning.message}`) as Error & {
    code?: string;
    details?: ProtocolChildSessionGuardrailWarning;
  };
  error.code = "PROTOCOL_CHILD_SESSION_GUARDRAIL";
  error.details = warning;
  throw error;
}

function toProtocolChildSessionGuardrailWarning(
  runtime: ProtocolChildSessionRuntime,
  code: ProtocolChildSessionGuardrailCode,
  message: string,
  details: {
    missingToolNames?: string[];
    requestedToolNames?: string[];
    availableToolNames?: string[];
  } = {},
): ProtocolChildSessionGuardrailWarning {
  const state = runtime as ProtocolChildSessionRuntime & {
    _currentTraceId?: string;
    _currentParentSpanId?: string;
    _currentDepth?: number;
    _currentBreadcrumb?: string[];
    _currentRunId?: string;
  };

  return {
    kind: "subagent_warning",
    code,
    traceId: state._currentTraceId ?? runtime.spanId,
    spanId: runtime.spanId,
    parentSpanId: state._currentParentSpanId,
    nodeId: runtime.nodeId,
    provide: runtime.provide,
    conversationToken: runtime.conversationToken,
    runId: state._currentRunId,
    depth: state._currentDepth ?? 1,
    timestamp: Date.now(),
    label: runtime.label,
    breadcrumb: [...(state._currentBreadcrumb ?? ["main", runtime.label])],
    message,
    missingToolNames: details.missingToolNames,
    requestedToolNames: details.requestedToolNames,
    availableToolNames: details.availableToolNames,
    visibility: runtime.visibility,
  };
}

function handleProtocolChildSessionGuardrail(
  runtime: ProtocolChildSessionRuntime,
  code: ProtocolChildSessionGuardrailCode,
  message: string,
  details: {
    missingToolNames?: string[];
    requestedToolNames?: string[];
    availableToolNames?: string[];
  } = {},
): void {
  const warning = toProtocolChildSessionGuardrailWarning(runtime, code, message, details);
  if (runtime.strict) {
    throwProtocolChildSessionGuardrail(warning);
  }
  emitProtocolChildSessionGuardrailWarning(runtime.projection, warning);
}

export function createProtocolChildSessionRuntime(
  options: ProtocolChildSessionRuntimeOptions,
): ProtocolChildSessionRuntime {
  const projection = options.projection;
  const label = options.label?.trim() || options.nodeId;
  const visibility = normalizeProtocolChildSessionVisibility(options.visibility, projection);
  const spanId = options.spanId?.trim() || crypto.randomUUID();
  const includeProtocolTool = options.includeProtocolTool ?? true;
  const extraToolNames = [...new Set((options.extraToolNames ?? []).map((toolName) => toolName.trim()).filter(Boolean))];
  const strict = options.strict ?? false;
  const current = {
    traceId: options.traceId,
    parentSpanId: options.parentSpanId,
    depth: options.depth,
    breadcrumb: normalizeProtocolChildSessionBreadcrumb(projection, label, options.breadcrumb),
  };
  const assistantMessagePolicy = normalizeProtocolChildAssistantMessagePolicy(
    options.assistantMessagePolicy,
    projection,
    visibility,
  );

  if (visibility.uiVisibility === "verbose" && !projection) {
    throw new Error("createProtocolChildSessionRuntime() requires projection when uiVisibility is verbose");
  }

  const runtime: ProtocolChildSessionRuntime & {
    _currentTraceId: string;
    _currentParentSpanId?: string;
    _currentDepth: number;
    _currentBreadcrumb: string[];
    _currentRunId?: string;
    _lastStatusFingerprint?: string;
    _startedEmitted: boolean;
    _extensionsBound: boolean;
  } = {
    options: Object.freeze({
      ...options,
      label,
      spanId,
      includeProtocolTool,
      extraToolNames: [...extraToolNames],
      assistantMessagePolicy,
      visibility,
      strict,
      breadcrumb: [...current.breadcrumb],
    }),
    projection,
    spanId,
    nodeId: options.nodeId,
    provide: options.provide,
    conversationToken: options.conversationToken,
    label,
    assistantMessagePolicy,
    visibility,
    includeProtocolTool,
    extraToolNames,
    extensionFactories: [],
    strict,
    _currentTraceId: current.traceId,
    _currentParentSpanId: current.parentSpanId,
    _currentDepth: current.depth,
    _currentBreadcrumb: [...current.breadcrumb],
    _currentRunId: undefined,
    _lastStatusFingerprint: undefined,
    _startedEmitted: false,
    _extensionsBound: false,
    updateInvocation(invocation) {
      if (typeof invocation.traceId === "string" && invocation.traceId.trim()) {
        this._currentTraceId = invocation.traceId;
      }
      if (typeof invocation.parentSpanId === "string" && invocation.parentSpanId.trim()) {
        this._currentParentSpanId = invocation.parentSpanId;
      }
      if (invocation.parentSpanId === undefined) {
        this._currentParentSpanId = undefined;
      }
      if (typeof invocation.depth === "number" && Number.isFinite(invocation.depth)) {
        this._currentDepth = invocation.depth;
      }
      if (invocation.breadcrumb?.length) {
        this._currentBreadcrumb = [...invocation.breadcrumb];
      }
    },
    beginRun(invocation = {}) {
      this.updateInvocation(invocation);
      this._currentRunId = crypto.randomUUID();
      this._lastStatusFingerprint = undefined;
      return this._currentRunId;
    },
    endRun(runId) {
      if (runId && this._currentRunId !== runId) {
        return;
      }
      this._currentRunId = undefined;
      this._lastStatusFingerprint = undefined;
    },
    emitStarted(summary) {
      if (this._startedEmitted) {
        return;
      }
      this._startedEmitted = true;
      const event: ProtocolSubagentStartedEvent = {
        kind: "subagent_started",
        traceId: this._currentTraceId,
        spanId: this.spanId,
        parentSpanId: this._currentParentSpanId,
        nodeId: this.nodeId,
        provide: this.provide,
        conversationToken: this.conversationToken,
        runId: this._currentRunId,
        depth: this._currentDepth,
        timestamp: Date.now(),
        label: this.label,
        breadcrumb: [...this._currentBreadcrumb],
        summary: summary?.trim() || `${this.nodeId}.${this.provide} delegated session started`,
      };
      if (this.visibility.uiVisibility === "hidden") {
        appendProtocolChildSessionEvent(this.projection, event);
        return;
      }
      emitProtocolSubagentStarted(this.projection ?? {}, event);
    },
    emitStatus(status, summary, error) {
      const fingerprint = JSON.stringify({ runId: this._currentRunId, status, summary, error });
      if (this._lastStatusFingerprint === fingerprint) {
        return;
      }
      this._lastStatusFingerprint = fingerprint;
      const event: ProtocolSubagentStatusEvent = {
        kind: "subagent_status",
        traceId: this._currentTraceId,
        spanId: this.spanId,
        parentSpanId: this._currentParentSpanId,
        nodeId: this.nodeId,
        provide: this.provide,
        conversationToken: this.conversationToken,
        runId: this._currentRunId,
        depth: this._currentDepth,
        timestamp: Date.now(),
        label: this.label,
        breadcrumb: [...this._currentBreadcrumb],
        status,
        summary,
        error,
      };
      if (this.visibility.uiVisibility === "hidden") {
        appendProtocolChildSessionEvent(this.projection, event);
        return;
      }
      emitProtocolSubagentStatus(this.projection ?? {}, event);
    },
    emitStream(event) {
      const payload: ProtocolSubagentStreamEvent = {
        ...event,
        traceId: this._currentTraceId,
        spanId: this.spanId,
        parentSpanId: this._currentParentSpanId,
        nodeId: this.nodeId,
        provide: this.provide,
        conversationToken: this.conversationToken,
        runId: this._currentRunId,
        depth: this._currentDepth,
        timestamp: Date.now(),
      } as ProtocolSubagentStreamEvent;
      if (this.visibility.uiVisibility === "hidden") {
        appendProtocolChildSessionEvent(this.projection, payload);
        return;
      }
      emitProtocolSubagentStream(this.projection ?? {}, payload);
    },
  };

  if (visibility.uiVisibility !== "hidden" && projection) {
    runtime.extensionFactories.push(createProtocolSubagentEventBridge({
      projection,
      traceId: current.traceId,
      spanId,
      parentSpanId: current.parentSpanId,
      nodeId: options.nodeId,
      provide: options.provide,
      conversationToken: options.conversationToken,
      depth: current.depth,
      label,
      breadcrumb: current.breadcrumb,
      emitStartedOnBind: false,
      getState: () => ({
        traceId: runtime._currentTraceId,
        parentSpanId: runtime._currentParentSpanId,
        depth: runtime._currentDepth,
        breadcrumb: [...runtime._currentBreadcrumb],
        runId: runtime._currentRunId,
        assistantMessagePolicy: runtime.assistantMessagePolicy,
      }),
    }));
  }

  if (visibility.uiVisibility === "verbose" && runtime.extensionFactories.length === 0) {
    throw new Error("createProtocolChildSessionRuntime() requires streaming bridge installation for verbose child sessions");
  }

  return runtime;
}

export async function applyProtocolChildSessionRuntime(
  session: ProtocolSubagentSessionLike,
  runtimeOrOptions: ProtocolChildSessionRuntime | ProtocolChildSessionRuntimeOptions,
): Promise<string[]> {
  const runtime = "extensionFactories" in runtimeOrOptions
    ? runtimeOrOptions
    : createProtocolChildSessionRuntime(runtimeOrOptions);

  if (
    runtime.visibility.uiVisibility === "verbose"
    && runtime.extensionFactories.length > 0
    && typeof session.bindExtensions !== "function"
  ) {
    handleProtocolChildSessionGuardrail(
      runtime,
      "verbose_streaming_unavailable",
      `${runtime.nodeId}.${runtime.provide} requested verbose child-session streaming, but no bindExtensions() hook is available to attach the runtime bridge.`,
    );
  }

  const sessionState = session as ProtocolSubagentSessionLike & {
    [PROTOCOL_CHILD_SESSION_BINDING_KEY]?: boolean;
  };
  if (typeof session.bindExtensions === "function" && !(runtime as ProtocolChildSessionRuntime & { _extensionsBound?: boolean })._extensionsBound) {
    if (!sessionState[PROTOCOL_CHILD_SESSION_BINDING_KEY]) {
      await session.bindExtensions({});
      sessionState[PROTOCOL_CHILD_SESSION_BINDING_KEY] = true;
    }
    (runtime as ProtocolChildSessionRuntime & { _extensionsBound?: boolean })._extensionsBound = true;
  }

  runtime.emitStarted();

  const availableToolNames = session.getAllTools?.().map((tool) => tool.name) ?? [];
  const toolNames = await applyProtocolInheritedTools(session, runtime.projection, {
    includeProtocolTool: runtime.includeProtocolTool,
    extraToolNames: runtime.extraToolNames,
  });
  const requestedToolNames = [
    ...PROTOCOL_CHILD_SESSION_REQUIRED_CORE_TOOLS,
    ...(runtime.includeProtocolTool ? ["protocol"] : []),
    ...runtime.extraToolNames,
  ];
  const missingRequiredToolNames = requestedToolNames.filter((toolName) => !toolNames.includes(toolName));

  if (missingRequiredToolNames.length > 0) {
    handleProtocolChildSessionGuardrail(
      runtime,
      runtime.includeProtocolTool && missingRequiredToolNames.includes("protocol")
        ? "protocol_tool_unavailable"
        : "missing_required_tools",
      `${runtime.nodeId}.${runtime.provide} child session is missing required delegated tools: ${missingRequiredToolNames.join(", ")}.`,
      {
        missingToolNames: missingRequiredToolNames,
        requestedToolNames,
        availableToolNames,
      },
    );
  }

  runtime.emitStatus(
    "running",
    `${runtime.nodeId}.${runtime.provide} child session ready with inherited tools: ${toolNames.join(", ") || "(none)"}`,
  );

  return toolNames;
}

function readProtocolSubagentBridgeState(options: ProtocolSubagentBridgeOptions): {
  traceId: string;
  parentSpanId?: string;
  depth: number;
  breadcrumb: string[];
  runId?: string;
  assistantMessagePolicy: ProtocolChildAssistantMessagePolicy;
} {
  return options.getState?.() ?? {
    traceId: options.traceId,
    parentSpanId: options.parentSpanId,
    depth: options.depth,
    breadcrumb: [...(options.breadcrumb ?? ["main", options.label ?? options.nodeId])],
    runId: undefined,
    assistantMessagePolicy: "stream",
  };
}

function getProtocolSubagentAssistantText(message: { content: unknown[] }): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => !!block && typeof block === "object" && (block as { type?: unknown }).type === "text" && typeof (block as { text?: unknown }).text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function coalesceProtocolSubagentDelta(
  buffer: string,
  flush: boolean,
): { emit?: string; rest: string } {
  if (!buffer) {
    return { rest: "" };
  }

  const shouldEmit =
    flush
    || buffer.includes("\n")
    || /[.!?](?:\s|$)/.test(buffer)
    || buffer.length >= 48;

  if (!shouldEmit) {
    return { rest: buffer };
  }

  return {
    emit: buffer.trim().length > 0 ? buffer : undefined,
    rest: "",
  };
}

function isStructuredAssistantJson(text: string): boolean {
  const normalized = text.trim();
  return normalized.startsWith("{") || normalized.startsWith("[");
}

export function createProtocolSubagentEventBridge(
  options: ProtocolSubagentBridgeOptions,
): ExtensionFactory {
  return (pi) => {
    let activeAssistantMessageId: string | undefined;
    let activeAssistantRunId: string | undefined;
    let lastAssistantText = "";
    let pendingAssistantDelta = "";
    let hasStreamedAssistantText = false;
    const toolRunIds = new Map<string, string>();

    const resetAssistantState = () => {
      activeAssistantMessageId = undefined;
      activeAssistantRunId = undefined;
      lastAssistantText = "";
      pendingAssistantDelta = "";
      hasStreamedAssistantText = false;
    };

    const isCurrentRun = (runId: string | undefined): runId is string => {
      if (!runId) {
        return false;
      }
      return readProtocolSubagentBridgeState(options).runId === runId;
    };

    if (options.emitStartedOnBind !== false) {
      const state = readProtocolSubagentBridgeState(options);
      emitProtocolSubagentStarted(options.projection, {
        kind: "subagent_started",
        traceId: state.traceId,
        spanId: options.spanId,
        parentSpanId: state.parentSpanId,
        nodeId: options.nodeId,
        provide: options.provide,
        conversationToken: options.conversationToken,
        runId: state.runId,
        depth: state.depth,
        timestamp: Date.now(),
        label: options.label,
        breadcrumb: state.breadcrumb,
        summary: `${options.nodeId}.${options.provide} delegated session started`,
      });
    }

    pi.on("message_start", async (event) => {
      if (event.message.role !== "assistant" || !Array.isArray(event.message.content)) {
        return;
      }
      resetAssistantState();
      const state = readProtocolSubagentBridgeState(options);
      if (!state.runId) {
        return;
      }
      activeAssistantRunId = state.runId;
      activeAssistantMessageId = `${options.spanId}:${state.runId}:${event.message.timestamp ?? Date.now()}`;
    });

    pi.on("message_update", async (event) => {
      if (event.message.role !== "assistant" || !Array.isArray(event.message.content)) {
        return;
      }
      const currentText = getProtocolSubagentAssistantText(event.message);
      const delta = currentText.startsWith(lastAssistantText) ? currentText.slice(lastAssistantText.length) : currentText;
      lastAssistantText = currentText;
      if (!delta || !isCurrentRun(activeAssistantRunId) || isStructuredAssistantJson(currentText)) {
        return;
      }

      const state = readProtocolSubagentBridgeState(options);
      if (state.assistantMessagePolicy !== "stream") {
        return;
      }

      pendingAssistantDelta += delta;
      if (!hasStreamedAssistantText) {
        hasStreamedAssistantText = true;
        emitProtocolSubagentStatus(options.projection, {
          kind: "subagent_status",
          traceId: state.traceId,
          spanId: options.spanId,
          parentSpanId: state.parentSpanId,
          nodeId: options.nodeId,
          provide: options.provide,
          conversationToken: options.conversationToken,
          runId: state.runId,
          depth: state.depth,
          timestamp: Date.now(),
          label: options.label,
          breadcrumb: state.breadcrumb,
          status: "streaming",
          summary: `${options.nodeId}.${options.provide} is streaming delegated work`,
        });
      }

      const { emit, rest } = coalesceProtocolSubagentDelta(pendingAssistantDelta, false);
      pendingAssistantDelta = rest;
      if (!emit) {
        return;
      }

      emitProtocolSubagentStream(options.projection, {
        kind: "subagent_message_delta",
        traceId: state.traceId,
        spanId: options.spanId,
        parentSpanId: state.parentSpanId,
        nodeId: options.nodeId,
        provide: options.provide,
        conversationToken: options.conversationToken,
        runId: state.runId,
        depth: state.depth,
        timestamp: Date.now(),
        messageId: activeAssistantMessageId ?? `${options.spanId}:${state.runId}:assistant`,
        delta: emit,
      });
    });

    pi.on("message_end", async (event) => {
      if (event.message.role !== "assistant" || !Array.isArray(event.message.content)) {
        return;
      }
      if (!isCurrentRun(activeAssistantRunId)) {
        resetAssistantState();
        return;
      }

      const state = readProtocolSubagentBridgeState(options);
      const text = getProtocolSubagentAssistantText(event.message);
      if (state.assistantMessagePolicy === "stream" && !isStructuredAssistantJson(text)) {
        const { emit } = coalesceProtocolSubagentDelta(pendingAssistantDelta, true);
        if (emit) {
          emitProtocolSubagentStream(options.projection, {
            kind: "subagent_message_delta",
            traceId: state.traceId,
            spanId: options.spanId,
            parentSpanId: state.parentSpanId,
            nodeId: options.nodeId,
            provide: options.provide,
            conversationToken: options.conversationToken,
            runId: state.runId,
            depth: state.depth,
            timestamp: Date.now(),
            messageId: activeAssistantMessageId ?? `${options.spanId}:${state.runId}:assistant`,
            delta: emit,
          });
        }

        if (text) {
          emitProtocolSubagentStream(options.projection, {
            kind: "subagent_message_completed",
            traceId: state.traceId,
            spanId: options.spanId,
            parentSpanId: state.parentSpanId,
            nodeId: options.nodeId,
            provide: options.provide,
            conversationToken: options.conversationToken,
            runId: state.runId,
            depth: state.depth,
            timestamp: Date.now(),
            messageId: activeAssistantMessageId ?? `${options.spanId}:${state.runId}:assistant`,
            text,
          });
        }
      }

      resetAssistantState();
    });

    pi.on("tool_execution_start", async (event) => {
      const state = readProtocolSubagentBridgeState(options);
      if (!state.runId) {
        return;
      }
      if (event.toolCallId) {
        toolRunIds.set(event.toolCallId, state.runId);
      }
      emitProtocolSubagentStatus(options.projection, {
        kind: "subagent_status",
        traceId: state.traceId,
        spanId: options.spanId,
        parentSpanId: state.parentSpanId,
        nodeId: options.nodeId,
        provide: options.provide,
        conversationToken: options.conversationToken,
        runId: state.runId,
        depth: state.depth,
        timestamp: Date.now(),
        label: options.label,
        breadcrumb: state.breadcrumb,
        status: "running",
        summary: `${options.nodeId}.${options.provide} is using ${event.toolName}`,
      });
      emitProtocolSubagentStream(options.projection, {
        kind: "subagent_tool_started",
        traceId: state.traceId,
        spanId: options.spanId,
        parentSpanId: state.parentSpanId,
        nodeId: options.nodeId,
        provide: options.provide,
        conversationToken: options.conversationToken,
        runId: state.runId,
        depth: state.depth,
        timestamp: Date.now(),
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        summary: JSON.stringify(event.args),
      });
    });

    pi.on("tool_execution_update", async (event) => {
      const runId = event.toolCallId ? toolRunIds.get(event.toolCallId) : readProtocolSubagentBridgeState(options).runId;
      if (!isCurrentRun(runId)) {
        return;
      }
      const state = readProtocolSubagentBridgeState(options);
      emitProtocolSubagentStream(options.projection, {
        kind: "subagent_tool_updated",
        traceId: state.traceId,
        spanId: options.spanId,
        parentSpanId: state.parentSpanId,
        nodeId: options.nodeId,
        provide: options.provide,
        conversationToken: options.conversationToken,
        runId,
        depth: state.depth,
        timestamp: Date.now(),
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        summary: JSON.stringify(event.partialResult),
      });
    });

    pi.on("tool_execution_end", async (event) => {
      const runId = event.toolCallId ? toolRunIds.get(event.toolCallId) : readProtocolSubagentBridgeState(options).runId;
      if (!isCurrentRun(runId)) {
        if (event.toolCallId) {
          toolRunIds.delete(event.toolCallId);
        }
        return;
      }
      const state = readProtocolSubagentBridgeState(options);
      emitProtocolSubagentStream(options.projection, {
        kind: "subagent_tool_completed",
        traceId: state.traceId,
        spanId: options.spanId,
        parentSpanId: state.parentSpanId,
        nodeId: options.nodeId,
        provide: options.provide,
        conversationToken: options.conversationToken,
        runId,
        depth: state.depth,
        timestamp: Date.now(),
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        summary: JSON.stringify(event.result),
      });
      if (event.toolCallId) {
        toolRunIds.delete(event.toolCallId);
      }
    });
  };
}
