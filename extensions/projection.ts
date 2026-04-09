import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import {
  PROTOCOL_CONVERSATION_MESSAGE_TYPE,
  PROTOCOL_HANDOFF_MESSAGE_TYPE,
  PROTOCOL_INVOKE_RESULT_MESSAGE_TYPE,
  PROTOCOL_PROMPT_AWARENESS_MARKER,
  PROTOCOL_SUBAGENT_STATUS_MESSAGE_TYPE,
  PROTOCOL_SUBAGENT_STREAM_MESSAGE_TYPE,
  clearProtocolConversationState,
  emitProtocolInvokeResultFromInvoke,
  ensureProtocolAgentProjection,
  getProtocolConversationSnapshot,
  type ProtocolAgentProjectionTarget,
  type ProtocolConversationMessageDetails,
  type ProtocolConversationResetMode,
  type ProtocolFabric,
  type ProtocolHandoffMessageDetails,
  type ProtocolInvokeResult,
  type ProtocolInvokeResultMessageDetails,
  type ProtocolSubagentLifecycleEvent,
  type ProtocolSubagentStreamEvent,
} from "../vendor/pi-protocol-sdk.ts";
import manifest from "../pi.protocol.json" with { type: "json" };
import type { ChatPiPiInput, ChatPiPiOutput } from "../protocol/contracts.ts";
import type { PiRuntime } from "./runtime.ts";

interface CommandContext {
  ui: {
    notify: (message: string, level?: "info" | "error") => void;
  };
}

const CHAT_PI_PI_RESULT_MESSAGE_TYPE = "chat-pi-pi-result";
const CHAT_PI_PI_RESULT_RENDERER_KEY = Symbol.for("pi-pi.chat-pi-pi-result-renderer");
const HOST_PROTOCOL_RENDERERS_KEY = Symbol.for("pi-pi.host-protocol-renderers");
const HOST_PROTOCOL_PROMPT_AWARENESS_KEY = Symbol.for("pi-pi.host-protocol-prompt-awareness");
const HOST_PROTOCOL_ROUTING_KEY = Symbol.for("pi-pi.host-protocol-routing");
const HOST_PROTOCOL_CALLER_NODE_ID = "pi-chat";

interface ChatPiPiResultMessageDetails {
  nodeId: string;
  provide: string;
  status: ChatPiPiOutput["status"];
  continuationState?: string;
  buildStatus?: string;
  repoDir?: string;
  packages?: string[];
}

type ProjectionRuntime = PiRuntime & {
  registerCommand?: ExtensionAPI["registerCommand"];
  registerMessageRenderer?: ExtensionAPI["registerMessageRenderer"];
};

type ThemeLike = {
  fg: (color: any, text: string) => string;
  bg: (color: any, text: string) => string;
  bold?: (text: string) => string;
};

type TintedSurfaceTone = "active" | "awaiting_user" | "completed" | "failed";

interface TintedSurfacePalette {
  borderBg: (value: string) => string;
  surfaceBg: (value: string) => string;
  badgeColor: "accent" | "warning" | "success" | "error";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function parseChatCommandInput(args: string | undefined): ChatPiPiInput {
  return {
    message: args?.trim() ?? "",
  };
}

function formatChatPiPiOutput(output: ChatPiPiOutput): string {
  const lines = [output.reply];

  if (output.questions?.length) {
    lines.push("", "Questions:", ...output.questions.map((question) => `- ${question}`));
  }

  if (output.missingInformation?.length) {
    lines.push("", "Missing information:", ...output.missingInformation.map((item) => `- ${item}`));
  }

  if (output.assumptionsOffered?.length) {
    lines.push("", "Assumptions I can use:", ...output.assumptionsOffered.map((item) => `- ${item}`));
  }

  if (output.reasons?.length) {
    lines.push("", "Reasons:", ...output.reasons.map((reason) => `- ${reason}`));
  }

  if (output.build) {
    lines.push(
      "",
      `Build status: ${output.build.status}`,
      `Repo: ${output.build.repoDir}`,
      `Packages: ${output.build.packages.map((pkg) => pkg.packageName).join(", ")}`,
    );
  }

  return lines.join("\n");
}

function applyAnsiBackground(code: number, value: string): string {
  return `\u001b[48;5;${code}m${value}\u001b[49m`;
}

function tintBackground(code: number): (value: string) => string {
  return (value) => applyAnsiBackground(code, value);
}

function getTintedSurfacePalette(tone: TintedSurfaceTone): TintedSurfacePalette {
  switch (tone) {
    case "active":
      return {
        borderBg: tintBackground(238),
        surfaceBg: tintBackground(233),
        badgeColor: "accent",
      };
    case "awaiting_user":
      return {
        borderBg: tintBackground(24),
        surfaceBg: tintBackground(17),
        badgeColor: "warning",
      };
    case "failed":
      return {
        borderBg: tintBackground(88),
        surfaceBg: tintBackground(52),
        badgeColor: "error",
      };
    case "completed":
    default:
      return {
        borderBg: tintBackground(19),
        surfaceBg: tintBackground(18),
        badgeColor: "success",
      };
  }
}

function themeBold(theme: ThemeLike, text: string): string {
  return typeof theme.bold === "function" ? theme.bold(text) : text;
}

function renderTintedCard(
  body: string,
  palette: TintedSurfacePalette,
  options: { compact?: boolean } = {},
): Box {
  const outer = new Box(1, options.compact ? 0 : 1, palette.borderBg);
  const inner = new Box(1, options.compact ? 0 : 1, palette.surfaceBg);
  inner.addChild(new Text(body, 0, 0));
  outer.addChild(inner);
  return outer;
}

function getInvokeResultTone(details: ProtocolInvokeResultMessageDetails | undefined): TintedSurfaceTone {
  if (details?.error) {
    return "failed";
  }

  if (details?.continuationState === "awaiting_user" || details?.status === "clarification_needed") {
    return "awaiting_user";
  }

  if (details?.status === "unsupported") {
    return "failed";
  }

  return "completed";
}

function getInvokeResultStatusLabel(details: ProtocolInvokeResultMessageDetails | undefined): string {
  if (details?.error) {
    return "Failed";
  }

  if (details?.continuationState === "awaiting_user") {
    return "Awaiting reply";
  }

  if (details?.continuationState === "awaiting_caller") {
    return "Returned control";
  }

  if (details?.status === "clarification_needed") {
    return "Clarification needed";
  }

  if (details?.status === "unsupported") {
    return "Unsupported";
  }

  return "Completed";
}

function renderDelegatedInvokeResultMessage(
  message: { customType: string; content: string | unknown[]; details?: unknown },
  options: { expanded: boolean },
  theme: ThemeLike,
): Box {
  const details = message.details as ProtocolInvokeResultMessageDetails | undefined;
  const body = typeof message.content === "string" ? message.content.trim() : "";
  const ownerLabel = details?.continuationOwnerLabel ?? details?.nodeId ?? "delegated node";
  const sourceLabel = details ? `${details.nodeId}.${details.provide}` : "protocol invoke";
  const statusLabel = getInvokeResultStatusLabel(details);
  const palette = getTintedSurfacePalette(getInvokeResultTone(details));

  const lines = [
    theme.fg("accent", themeBold(theme, `Talking to: ${ownerLabel}`)),
    `${theme.fg(palette.badgeColor, `[${statusLabel}]`)} ${theme.fg("dim", sourceLabel)}`,
  ];

  if (body) {
    lines.push("", body);
  }

  if (options.expanded && details) {
    const meta = [
      `from: ${sourceLabel}`,
      details.continuationState ? `continuation: ${details.continuationState}` : "",
      details.continuationToken ? `conversation: ${details.continuationToken}` : "",
      details.error ? `error: ${details.error.code} — ${details.error.message}` : "",
    ].filter(Boolean);
    if (meta.length > 0) {
      lines.push("", theme.fg("dim", meta.join("\n")));
    }
  }

  return renderTintedCard(lines.join("\n"), palette);
}

function getSubagentStatusTone(details: ProtocolSubagentLifecycleEvent | undefined): TintedSurfaceTone {
  const status = details?.kind === "subagent_started" ? "running" : details?.status ?? "running";
  if (status === "failed" || status === "cancelled") {
    return "failed";
  }
  if (status === "waiting_user") {
    return "awaiting_user";
  }
  if (status === "completed") {
    return "completed";
  }
  return "active";
}

function getSubagentStatusLabel(details: ProtocolSubagentLifecycleEvent | undefined): string {
  const status = details?.kind === "subagent_started" ? "started" : details?.status ?? "running";
  switch (status) {
    case "started":
      return "Starting";
    case "streaming":
      return "Streaming";
    case "waiting_user":
      return "Awaiting reply";
    case "waiting_caller":
      return "Returned control";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Running";
  }
}

function renderDelegatedStatusMessage(
  message: { customType: string; content: string | unknown[]; details?: unknown },
  options: { expanded: boolean },
  theme: ThemeLike,
): Box {
  const details = message.details as ProtocolSubagentLifecycleEvent | undefined;
  const ownerLabel = details?.label ?? details?.nodeId ?? "delegated node";
  const sourceLabel = details ? `${details.nodeId}.${details.provide}` : "subagent";
  const palette = getTintedSurfacePalette(getSubagentStatusTone(details));
  const statusLabel = getSubagentStatusLabel(details);
  const lines = [
    theme.fg("accent", themeBold(theme, `Talking to: ${ownerLabel}`)),
    `${theme.fg(palette.badgeColor, `[${statusLabel}]`)} ${theme.fg("dim", sourceLabel)}`,
  ];

  if (options.expanded && details) {
    const breadcrumb = details.breadcrumb?.join(" > ") ?? "main";
    const meta = [
      details.summary ?? "",
      `breadcrumb: ${breadcrumb}`,
      `trace: ${details.traceId}`,
      `span: ${details.spanId}`,
      details.runId ? `run: ${details.runId}` : "",
      details.conversationToken ? `conversation: ${details.conversationToken}` : "",
      details.kind === "subagent_status" && details.error ? `error: ${details.error.code ?? "EXECUTION_FAILED"}: ${details.error.message}` : "",
    ].filter(Boolean);
    if (meta.length > 0) {
      lines.push(theme.fg("dim", meta.join("\n")));
    }
  }

  return renderTintedCard(lines.join("\n"), palette, { compact: true });
}

function getHandoffTone(details: ProtocolHandoffMessageDetails | undefined): TintedSurfaceTone {
  const status = details?.status ?? "done";
  if (status === "failed") return "failed";
  if (status === "running") return "active";
  return "completed";
}

function getHandoffStatusLabel(details: ProtocolHandoffMessageDetails | undefined): string {
  const status = details?.status ?? "done";
  if (status === "running") return "Running";
  if (status === "failed") return "Failed";
  return "Completed";
}

function renderHandoffMessage(
  message: { customType: string; content: string | unknown[]; details?: unknown },
  options: { expanded: boolean },
  theme: ThemeLike,
): Box {
  const details = message.details as ProtocolHandoffMessageDetails | undefined;
  const label = details?.label ?? (typeof message.content === "string" ? message.content : "handoff");
  const sourceLabel = details ? `${details.nodeId}.${details.provide}` : "handoff";
  const palette = getTintedSurfacePalette(getHandoffTone(details));
  const lines = [
    theme.fg("accent", themeBold(theme, label)),
    `${theme.fg(palette.badgeColor, `[${getHandoffStatusLabel(details)}]`)} ${theme.fg("dim", sourceLabel)}`,
  ];

  if (details?.brief) {
    lines.push("", details.brief);
  }

  if (options.expanded && details) {
    const meta = [
      `trace: ${details.traceId}`,
      `span: ${details.spanId}`,
      `handoff: ${details.handoffId}`,
      `opaque: ${details.opaque ? "true" : "false"}`,
      details.error ? `error: ${details.error.code}: ${details.error.message}` : "",
    ].filter(Boolean);
    if (meta.length > 0) {
      lines.push("", theme.fg("dim", meta.join("\n")));
    }
  }

  return renderTintedCard(lines.join("\n"), palette, { compact: true });
}

function renderConversationMessage(
  message: { customType: string; content: string | unknown[]; details?: unknown },
  options: { expanded: boolean },
  theme: ThemeLike,
): Box {
  const details = message.details as ProtocolConversationMessageDetails | undefined;
  const delegated = details?.delegated ?? false;
  const ownerLabel = details?.ownerLabel ?? "main agent";
  const breadcrumb = details?.breadcrumb?.join(" > ") ?? "main";
  const palette = getTintedSurfacePalette(delegated ? "active" : "completed");
  const lines = [
    theme.fg("accent", themeBold(theme, `Talking to: ${ownerLabel}`)),
    theme.fg("dim", breadcrumb),
  ];

  if (options.expanded && details?.activeFrame) {
    const meta = [
      `node: ${details.activeFrame.nodeId}`,
      `provide: ${details.activeFrame.provide}`,
      `token: ${details.activeFrame.token}`,
      `state: ${details.activeFrame.state}`,
    ];
    lines.push("", theme.fg("dim", meta.join("\n")));
  }

  return renderTintedCard(lines.join("\n"), palette, { compact: true });
}

function getSubagentStreamLabel(details: ProtocolSubagentStreamEvent | undefined): string {
  if (!details) return "Stream";
  switch (details.kind) {
    case "subagent_tool_started":
      return `Tool started: ${details.toolName}`;
    case "subagent_tool_updated":
      return `Tool update: ${details.toolName}`;
    case "subagent_tool_completed":
      return `Tool completed: ${details.toolName}`;
    case "subagent_message_completed":
      return "Message completed";
    default:
      return "Message";
  }
}

function getSubagentStreamBody(message: { content: string | unknown[]; details?: unknown }): string {
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }

  const details = message.details as ProtocolSubagentStreamEvent | undefined;
  if (!details) return "";
  if (details.kind === "subagent_message_delta") return details.delta;
  if (details.kind === "subagent_message_completed") return details.text;
  return details.summary ?? "";
}

function renderSubagentStreamMessage(
  message: { customType: string; content: string | unknown[]; details?: unknown },
  options: { expanded: boolean },
  theme: ThemeLike,
): Box {
  const details = message.details as ProtocolSubagentStreamEvent | undefined;
  const sourceLabel = details ? `${details.nodeId}.${details.provide}` : "subagent stream";
  const palette = getTintedSurfacePalette("active");
  const lines = [
    theme.fg("accent", themeBold(theme, getSubagentStreamLabel(details))),
    theme.fg("dim", sourceLabel),
  ];
  const body = getSubagentStreamBody(message);
  if (body) {
    lines.push("", body);
  }

  if (options.expanded && details) {
    const meta = [
      `trace: ${details.traceId}`,
      `span: ${details.spanId}`,
      `depth: ${details.depth}`,
      details.runId ? `run: ${details.runId}` : "",
      details.conversationToken ? `conversation: ${details.conversationToken}` : "",
      "toolName" in details && details.toolCallId ? `toolCallId: ${details.toolCallId}` : "",
      "messageId" in details ? `messageId: ${details.messageId}` : "",
    ].filter(Boolean);
    if (meta.length > 0) {
      lines.push("", theme.fg("dim", meta.join("\n")));
    }
  }

  return renderTintedCard(lines.join("\n"), palette, { compact: true });
}

function ensureHostProtocolRenderers(pi: ProjectionRuntime): void {
  if (!pi.registerMessageRenderer) {
    return;
  }

  const state = pi as unknown as Record<PropertyKey, unknown>;
  if (state[HOST_PROTOCOL_RENDERERS_KEY]) {
    return;
  }

  pi.registerMessageRenderer(PROTOCOL_HANDOFF_MESSAGE_TYPE, renderHandoffMessage);
  pi.registerMessageRenderer(PROTOCOL_INVOKE_RESULT_MESSAGE_TYPE, renderDelegatedInvokeResultMessage);
  pi.registerMessageRenderer(PROTOCOL_CONVERSATION_MESSAGE_TYPE, renderConversationMessage);
  pi.registerMessageRenderer(PROTOCOL_SUBAGENT_STATUS_MESSAGE_TYPE, renderDelegatedStatusMessage);
  pi.registerMessageRenderer(PROTOCOL_SUBAGENT_STREAM_MESSAGE_TYPE, renderSubagentStreamMessage);
  state[HOST_PROTOCOL_RENDERERS_KEY] = true;
}

function listVisibleToolNames(pi: ProjectionRuntime): Set<string> {
  const activeToolNames = pi.getActiveTools?.() ?? [];
  if (activeToolNames.length > 0) {
    return new Set(activeToolNames);
  }

  return new Set((pi.getAllTools?.() ?? []).map((tool) => tool.name));
}

function renderProtocolPromptAwareness(toolName: string): string {
  return `${PROTOCOL_PROMPT_AWARENESS_MARKER}
- Use \`${toolName}\` only for protocol work; answer simple non-protocol questions directly.
- Valid top-level protocol actions are exactly: \`registry\`, \`describe_node\`, \`describe_provide\`, \`find_provides\`, and \`invoke\`.
- Use \`query\` only as the nested filter object for \`find_provides\`, e.g. {"action":"find_provides","query":{"tagsAny":["..."],"visibility":"public"}}.
- For create/edit/build/modify/migrate/reuse requests, discover a public provide before doing local work.
- Fast path: registry -> describe_node -> describe_provide -> invoke. If the user says “ask that node”, invoke its chat-like provide instead of summarizing metadata.
- Follow the provider schema exactly. Example invoke: {"action":"invoke","request":{"provide":"<provide>","target":{"nodeId":"<nodeId>"},"input":{...}}}. For general chat, use \`input.message\`.
- After a visible conversational invoke result, usually stop. If it ends with a question, treat the next user reply as addressed to that node unless the user redirects.`;
}

function ensureHostProtocolPromptAwareness(pi: ProjectionRuntime, toolName = "protocol"): void {
  if (!pi.on) {
    return;
  }

  const state = pi as unknown as Record<PropertyKey, unknown>;
  if (state[HOST_PROTOCOL_PROMPT_AWARENESS_KEY]) {
    return;
  }

  pi.on("before_agent_start", async (event) => {
    if (!listVisibleToolNames(pi).has(toolName)) {
      return;
    }

    if (event.systemPrompt.includes(PROTOCOL_PROMPT_AWARENESS_MARKER)) {
      return;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${renderProtocolPromptAwareness(toolName)}`,
    };
  });

  state[HOST_PROTOCOL_PROMPT_AWARENESS_KEY] = true;
}

function getConversationOverride(text: string): ProtocolConversationResetMode | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === "/cancel-handoff") {
    return "all";
  }
  if (normalized === "back") {
    return "active-frame";
  }
  return null;
}

function ensureHostProtocolConversationRouting(pi: ProjectionRuntime, fabric: ProtocolFabric): void {
  if (!pi.on) {
    return;
  }

  const state = pi as unknown as Record<PropertyKey, unknown>;
  if (state[HOST_PROTOCOL_ROUTING_KEY]) {
    return;
  }

  pi.on("input", async (event) => {
    if (event.source === "extension") {
      return { action: "continue" };
    }

    const override = getConversationOverride(event.text);
    if (override) {
      clearProtocolConversationState(pi, override);
      return { action: "handled" };
    }

    const activeFrame = getProtocolConversationSnapshot(pi).activeFrame;
    if (!activeFrame) {
      return { action: "continue" };
    }

    const result = await fabric.invoke({
      callerNodeId: HOST_PROTOCOL_CALLER_NODE_ID,
      provide: activeFrame.provide,
      target: { nodeId: activeFrame.nodeId },
      routing: "deterministic",
      input: {
        message: event.text,
        conversationToken: activeFrame.token,
      },
    });

    emitProtocolInvokeResultFromInvoke(pi, result, {
      nodeId: activeFrame.nodeId,
      provide: activeFrame.provide,
    });
    return { action: "handled" };
  });

  state[HOST_PROTOCOL_ROUTING_KEY] = true;
}

function ensureChatPiPiResultRenderer(pi: ProjectionRuntime): void {
  if (!pi.registerMessageRenderer) {
    return;
  }

  const state = pi as unknown as Record<PropertyKey, unknown>;
  if (state[CHAT_PI_PI_RESULT_RENDERER_KEY]) {
    return;
  }

  pi.registerMessageRenderer(
    CHAT_PI_PI_RESULT_MESSAGE_TYPE,
    (message, { expanded }, theme) => {
      const details = message.details as ChatPiPiResultMessageDetails | undefined;
      const status = details?.status ?? "completed";
      const statusColor = status === "completed" ? "success" : status === "unsupported" ? "error" : "warning";
      const heading = theme.fg(statusColor, `[${status}]`);
      const sourceLabel = details ? `${details.nodeId}.${details.provide}` : "pi-pi.chat_pi_pi";
      let text = `${heading} ${theme.fg("accent", sourceLabel)}`;
      if (typeof message.content === "string" && message.content.length > 0) {
        text += `\n\n${message.content}`;
      }

      if (expanded && details) {
        const lines: string[] = [];
        lines.push(`from: ${sourceLabel}`);
        if (details.continuationState) lines.push(`continuation: ${details.continuationState}`);
        if (details.buildStatus) lines.push(`build: ${details.buildStatus}`);
        if (details.repoDir) lines.push(`repo: ${details.repoDir}`);
        if (details.packages?.length) lines.push(`packages: ${details.packages.join(", ")}`);
        if (lines.length > 0) {
          text += `\n${theme.fg("dim", lines.join("\n"))}`;
        }
      }

      const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));
      box.addChild(new Text(text, 0, 0));
      return box;
    },
  );

  state[CHAT_PI_PI_RESULT_RENDERER_KEY] = true;
}

function presentResult(pi: ProjectionRuntime, ctx: CommandContext, result: ProtocolInvokeResult<ChatPiPiOutput>): void {
  if (!result.ok) {
    ctx.ui.notify(result.error.message, "error");
    return;
  }

  const formatted = formatChatPiPiOutput(result.output);
  if (pi.sendMessage) {
    pi.sendMessage({
      customType: CHAT_PI_PI_RESULT_MESSAGE_TYPE,
      content: formatted,
      display: true,
      details: {
        nodeId: result.nodeId,
        provide: result.provide,
        status: result.output.status,
        continuationState: result.output.continuation?.state,
        buildStatus: result.output.build?.status,
        repoDir: result.output.build?.repoDir,
        packages: result.output.build?.packages.map((pkg) => pkg.packageName),
      } satisfies ChatPiPiResultMessageDetails,
    });
    return;
  }

  const level = result.output.status === "unsupported" ? "error" : "info";
  ctx.ui.notify(formatted, level);
}

export function initializeProtocolProjection(pi: ProjectionRuntime, fabric: ProtocolFabric): void {
  pi.on("session_start", async () => {
    ensureProtocolAgentProjection(pi as ProtocolAgentProjectionTarget, fabric);
    ensureHostProtocolPromptAwareness(pi);
    ensureHostProtocolConversationRouting(pi, fabric);
    ensureHostProtocolRenderers(pi);
    ensureChatPiPiResultRenderer(pi);
  });

  pi.registerCommand?.("chat-pi-pi", {
    description: "Chat with pi-pi's certified package builder through the public chat_pi_pi protocol contract.",
    handler: async (args, ctx) => {
      try {
        const input = parseChatCommandInput(args);
        const result = await invokeSelf<ChatPiPiOutput>(fabric, "chat_pi_pi", input);
        presentResult(pi, ctx, result);
      } catch (error) {
        ctx.ui.notify(toErrorMessage(error), "error");
      }
    },
  });
}
