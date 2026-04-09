import path from "node:path";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  defineTool,
  type CreateAgentSessionOptions,
  type ModelRegistry,
  type SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { normalizeWhitespace, resolveInternalInstruction } from "./planner-policy.ts";
import {
  getOrCreateChatPiPiConversationState,
  type ChatPiPiConversationState,
  type RuntimeHints,
} from "./chat-conversation-store.ts";
import { classifyCertifiedBuildRepo } from "./builder-support.ts";
import { buildCertifiedExtension, findUnsupportedCertifiedBuilderReasons } from "./build.ts";
import { protocolError } from "./core-shared.ts";
import type { ChatPiPiInput, ChatPiPiOutput } from "./contracts.ts";
import {
  applyProtocolChildSessionRuntime,
  createProtocolChildSessionRuntime,
  handleProtocolToolRequest,
  type ProtocolChildSessionRuntime,
  type ProtocolDelegationSurface,
  type ProtocolSessionPi,
  type ProtocolToolInput,
  type ProtocolToolRequest,
  type RoutingMode,
} from "../vendor/pi-protocol-sdk.ts";

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant" && Array.isArray(message.content);
}

function getAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function getLastAssistantText(messages: AgentMessage[]): string {
  const assistant = [...messages].reverse().find(isAssistantMessage);
  return assistant ? getAssistantText(assistant) : "";
}

function stripJsonCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() || text.trim();
}

function parseChatPiPiOutput(text: string): ChatPiPiOutput {
  const normalized = stripJsonCodeFences(text);
  const parsed = JSON.parse(normalized) as ChatPiPiOutput;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("internal orchestrator did not return an object");
  }
  if (!["clarification_needed", "completed", "unsupported"].includes(parsed.status)) {
    throw new Error("internal orchestrator returned an invalid status");
  }
  if (typeof parsed.reply !== "string") {
    throw new Error("internal orchestrator returned no reply string");
  }
  return parsed;
}

function toSessionOptions(runtimeHints: unknown): Partial<CreateAgentSessionOptions> {
  const hints = (runtimeHints ?? {}) as RuntimeHints;
  const options: Partial<CreateAgentSessionOptions> = {};

  if (hints.model) {
    options.model = hints.model as CreateAgentSessionOptions["model"];
  }
  if (
    hints.thinkingLevel === "off" ||
    hints.thinkingLevel === "low" ||
    hints.thinkingLevel === "medium" ||
    hints.thinkingLevel === "high"
  ) {
    options.thinkingLevel = hints.thinkingLevel as ThinkingLevel;
  }
  if (hints.modelRegistry) {
    options.modelRegistry = hints.modelRegistry as ModelRegistry;
  }
  if (hints.settingsManager) {
    options.settingsManager = hints.settingsManager as SettingsManager;
  }

  return options;
}

function validateChatPiPiOutput(output: ChatPiPiOutput): ChatPiPiOutput {
  if (output.questions && !Array.isArray(output.questions)) {
    throw protocolError("INVALID_OUTPUT", "chat_pi_pi questions must be an array when present");
  }
  if (output.missingInformation && !Array.isArray(output.missingInformation)) {
    throw protocolError("INVALID_OUTPUT", "chat_pi_pi missingInformation must be an array when present");
  }
  if (output.assumptionsOffered && !Array.isArray(output.assumptionsOffered)) {
    throw protocolError("INVALID_OUTPUT", "chat_pi_pi assumptionsOffered must be an array when present");
  }
  if (output.reasons && !Array.isArray(output.reasons)) {
    throw protocolError("INVALID_OUTPUT", "chat_pi_pi reasons must be an array when present");
  }
  return output;
}

function toProtocolSessionPi(runtimeHints: unknown): ProtocolSessionPi | undefined {
  const value = ((runtimeHints ?? {}) as RuntimeHints).protocolSessionPi;
  return value && typeof value === "object" ? (value as ProtocolSessionPi) : undefined;
}

function toProtocolDelegate(runtimeHints: unknown): ProtocolDelegationSurface | undefined {
  const value = ((runtimeHints ?? {}) as RuntimeHints & { protocolDelegate?: unknown }).protocolDelegate;
  return value && typeof value === "object" ? (value as ProtocolDelegationSurface) : undefined;
}

function getOrCreateChildRuntime(
  state: ChatPiPiConversationState,
  runtimeHints: unknown,
): ProtocolChildSessionRuntime {
  const protocolPi = toProtocolSessionPi(runtimeHints);
  const hints = (runtimeHints ?? {}) as RuntimeHints;
  const nextTraceId = hints.protocolTraceId ?? state.subagentSpanId;
  const nextParentSpanId = hints.protocolSpanId ?? hints.protocolParentSpanId;
  const nextDepth = typeof hints.protocolDepth === "number" ? hints.protocolDepth + 1 : 1;

  if (!state.childRuntime) {
    state.childRuntime = createProtocolChildSessionRuntime({
      projection: protocolPi,
      traceId: nextTraceId,
      spanId: state.subagentSpanId,
      parentSpanId: nextParentSpanId,
      depth: nextDepth,
      nodeId: "pi-pi",
      provide: "chat_pi_pi",
      conversationToken: state.token,
      label: "pi-pi",
      includeProtocolTool: true,
      extraToolNames: ["inspect_build_target", "execute_certified_build"],
      assistantMessagePolicy: "final-only",
      strict: !!protocolPi,
    });
  }

  state.childRuntime.updateInvocation({
    traceId: nextTraceId,
    parentSpanId: nextParentSpanId,
    depth: nextDepth,
  });
  return state.childRuntime;
}

function summarizeValue(value: unknown, maxLength = 240): string | undefined {
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
  }

  if (value === undefined) {
    return undefined;
  }

  try {
    const json = JSON.stringify(value);
    if (!json) return undefined;
    return json.length <= maxLength ? json : `${json.slice(0, maxLength - 1)}…`;
  } catch {
    return String(value);
  }
}

function normalizeRequestedProvideName(
  provide: string,
  explicitNodeId?: string,
): { nodeId?: string; provide: string } {
  const trimmed = provide.trim();
  const firstDot = trimmed.indexOf(".");
  if (firstDot <= 0) {
    return { nodeId: explicitNodeId, provide: trimmed };
  }

  const nodeId = trimmed.slice(0, firstDot);
  const localProvide = trimmed.slice(firstDot + 1);
  if (!localProvide) {
    return { nodeId: explicitNodeId, provide: trimmed };
  }

  if (explicitNodeId && explicitNodeId !== nodeId) {
    return { nodeId: explicitNodeId, provide: trimmed };
  }

  return {
    nodeId,
    provide: localProvide,
  };
}

function parseProtocolToolInput(input: ProtocolToolInput): ProtocolToolRequest {
  switch (input.action) {
    case "query":
      throw new Error(
        'Invalid protocol action "query". Valid top-level actions are registry, describe_node, describe_provide, find_provides, and invoke. Use action:"find_provides" with a nested query object instead.',
      );

    case "registry":
      return { action: "registry" };

    case "describe_node":
      if (!input.nodeId?.trim()) {
        throw new Error("protocol tool action describe_node requires nodeId");
      }
      return {
        action: "describe_node",
        nodeId: input.nodeId,
      };

    case "describe_provide": {
      if (!input.nodeId?.trim() || !input.provide?.trim()) {
        throw new Error("protocol tool action describe_provide requires nodeId and provide");
      }
      const normalizedProvide = normalizeRequestedProvideName(input.provide, input.nodeId).provide;
      return {
        action: "describe_provide",
        nodeId: input.nodeId,
        provide: normalizedProvide,
      };
    }

    case "find_provides":
      return {
        action: "find_provides",
        query: input.query,
      };

    case "invoke": {
      const request = input.request ?? {};
      const providedProvide = request.provide?.trim() || input.provide?.trim();
      if (!providedProvide) {
        throw new Error("protocol tool action invoke requires request.provide or provide");
      }

      const providedNodeId = request.target?.nodeId?.trim() || input.nodeId?.trim();
      const normalizedProvide = normalizeRequestedProvideName(providedProvide, providedNodeId);
      const routingMode = request.routing as RoutingMode | "local" | "public" | undefined;
      const normalizedRouting =
        routingMode === "local"
          ? "deterministic"
          : routingMode === "public"
            ? "best-match"
            : routingMode === "best-match" || routingMode === "deterministic"
              ? routingMode
              : undefined;

      return {
        action: "invoke",
        request: {
          provide: normalizedProvide.provide,
          input: request.input,
          target: {
            ...request.target,
            nodeId: normalizedProvide.nodeId ?? providedNodeId,
          },
          routing: normalizedRouting,
          modelHint: request.modelHint,
          budget: request.budget,
          handoff: request.handoff,
        },
      };
    }

    default:
      throw new Error(
        `Invalid protocol action ${JSON.stringify(input.action)}. Valid top-level actions are registry, describe_node, describe_provide, find_provides, and invoke.`,
      );
  }
}

function formatChildProtocolToolResult(result: unknown): string {
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function createChildProtocolTool(
  state: ChatPiPiConversationState,
  runtimeHints: unknown,
) {
  const delegate = toProtocolDelegate(runtimeHints);
  if (!delegate) {
    return null;
  }

  return defineTool({
    name: "protocol",
    label: "Protocol",
    description: "Inspect the Pi Protocol registry and invoke public provides through the shared protocol fabric.",
    promptSnippet: "protocol: list public provides, inspect protocol nodes/provides, and invoke them through the shared fabric",
    promptGuidelines: [
      "Use this tool to discover and invoke public provides.",
      "For protocol work, keep the path short: registry -> describe_node -> describe_provide -> invoke.",
      "If the user says “ask that node”, invoke its chat-like provide instead of paraphrasing registry metadata.",
      "Follow the provider schema exactly. For general chat, use input.message.",
      "After a visible conversational invoke result, usually stop. If it ends with a question, treat the next user reply as addressed to that node unless the user redirects.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("registry"),
        Type.Literal("describe_node"),
        Type.Literal("describe_provide"),
        Type.Literal("find_provides"),
        Type.Literal("invoke"),
      ]),
      nodeId: Type.Optional(Type.String()),
      provide: Type.Optional(Type.String()),
      query: Type.Optional(
        Type.Object({
          nodeId: Type.Optional(Type.String()),
          name: Type.Optional(Type.String()),
          tagsAny: Type.Optional(Type.Array(Type.String())),
          effectsAny: Type.Optional(Type.Array(Type.String())),
          visibility: Type.Optional(Type.Literal("public")),
        }),
      ),
      request: Type.Optional(
        Type.Object({
          provide: Type.Optional(Type.String()),
          input: Type.Optional(Type.Any()),
          target: Type.Optional(
            Type.Object({
              nodeId: Type.Optional(Type.String()),
              tagsAny: Type.Optional(Type.Array(Type.String())),
            }),
          ),
          routing: Type.Optional(
            Type.Union([
              Type.Literal("deterministic"),
              Type.Literal("best-match"),
              Type.Literal("local"),
              Type.Literal("public"),
            ]),
          ),
          modelHint: Type.Optional(
            Type.Object({
              tier: Type.Optional(
                Type.Union([Type.Literal("fast"), Type.Literal("balanced"), Type.Literal("reasoning")]),
              ),
              specific: Type.Optional(Type.Union([Type.String(), Type.Null()])),
            }),
          ),
          budget: Type.Optional(
            Type.Object({
              remainingUsd: Type.Optional(Type.Number()),
              remainingTokens: Type.Optional(Type.Number()),
              deadlineMs: Type.Optional(Type.Number()),
            }),
          ),
          handoff: Type.Optional(
            Type.Object({
              brief: Type.Optional(Type.String()),
              opaque: Type.Optional(Type.Boolean()),
            }),
          ),
        }),
      ),
    }),
    execute: async (_toolCallId, input: ProtocolToolInput) => {
      const request = parseProtocolToolInput(input);
      const result = await handleProtocolToolRequest(delegate, request);
      getOrCreateChildRuntime(state, runtimeHints).emitStatus("running", `pi-pi queried protocol via ${request.action}`);
      return {
        content: [{ type: "text" as const, text: formatChildProtocolToolResult(result) }],
        details: {
          action: request.action,
          result,
        },
      };
    },
  });
}

async function ensureConversationSession(
  state: ChatPiPiConversationState,
  runtimeHints: unknown,
): Promise<NonNullable<ChatPiPiConversationState["session"]>> {
  if (state.session) {
    state.updatedAt = Date.now();
    return state.session;
  }

  const instruction = await resolveInternalInstruction("chat-pi-pi-orchestrator");

  const inspectBuildTarget = defineTool({
    name: "inspect_build_target",
    label: "Inspect Build Target",
    description: "Inspect the target repo/build path and report whether it is greenfield or brownfield before deciding whether to build or clarify.",
    promptSnippet: "inspect_build_target: inspect repoDir/current cwd and report resolved path plus greenfield/brownfield state before a build decision when needed",
    parameters: Type.Object({
      repoDir: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, params) => {
      const resolvedRepoDir = path.resolve(params.repoDir?.trim() || state.workingDir);
      const repoState = await classifyCertifiedBuildRepo(resolvedRepoDir);
      const details = {
        repoDir: resolvedRepoDir,
        repoState: repoState.kind,
        entryCount: repoState.entries.length,
        entriesPreview: repoState.entries.slice(0, 12),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(details) }],
        details,
      };
    },
  });

  const executeCertifiedBuild = defineTool({
    name: "execute_certified_build",
    label: "Execute Certified Build",
    description: "Run pi-pi's internal certified build path and return the nested build result used by the public chat contract.",
    promptSnippet: "execute_certified_build: run the internal certified build path once the request is clearly a build and enough information is present",
    parameters: Type.Object({
      description: Type.String(),
      repoDir: Type.Optional(Type.String()),
      applyChanges: Type.Optional(Type.Boolean()),
      replaceExisting: Type.Optional(Type.Boolean()),
    }),
    execute: async (_toolCallId, params) => {
      const build = await buildCertifiedExtension({
        description: params.description,
        repoDir: params.repoDir,
        applyChanges: params.applyChanges,
        replaceExisting: params.replaceExisting,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(build) }],
        details: build,
      };
    },
  });

  const protocolTool = createChildProtocolTool(state, runtimeHints);
  const childRuntime = getOrCreateChildRuntime(state, runtimeHints);
  const hints = (runtimeHints ?? {}) as RuntimeHints;

  const loader = new DefaultResourceLoader({
    cwd: state.workingDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    extensionFactories: childRuntime.extensionFactories,
    systemPromptOverride: () => instruction.content,
    appendSystemPromptOverride: () => [],
  });
  await loader.reload();

  const createSession = typeof hints.createAgentSession === "function" ? hints.createAgentSession : createAgentSession;
  const { session } = await createSession({
    cwd: state.workingDir,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    customTools: [
      inspectBuildTarget,
      executeCertifiedBuild,
      ...(protocolTool ? [protocolTool] : []),
    ],
    ...toSessionOptions(runtimeHints),
  });

  await applyProtocolChildSessionRuntime(session, childRuntime);

  state.session = session;
  state.updatedAt = Date.now();
  return session;
}

function buildRepoDirDescription(input: ChatPiPiInput, state: ChatPiPiConversationState): string {
  if (input.repoDir?.trim()) {
    return `The caller explicitly provided repoDir=${JSON.stringify(path.resolve(input.repoDir.trim()))}.`;
  }

  return `The caller did not provide repoDir. If you need repo facts, inspect the current working directory ${JSON.stringify(state.workingDir)} before deciding.`;
}

function buildOrchestratorPrompt(input: ChatPiPiInput, state: ChatPiPiConversationState): string {
  const unsupportedHints = findUnsupportedCertifiedBuilderReasons(normalizeWhitespace(input.message));
  const continuationLine = input.conversationToken?.trim()
    ? `Continue the existing delegated conversation identified by conversationToken=${JSON.stringify(input.conversationToken.trim())}.`
    : `This is the first turn for delegated conversation token ${JSON.stringify(state.token)}.`;

  return [
    "Return exactly one JSON object matching the public chat_pi_pi output schema.",
    continuationLine,
    "",
    "Turn-specific facts:",
    "- User message:",
    input.message,
    `- ${buildRepoDirDescription(input, state)}`,
    `- applyChanges hint: ${input.applyChanges === undefined ? "unspecified" : String(input.applyChanges)}`,
    `- replaceExisting hint: ${input.replaceExisting === undefined ? "unspecified" : String(input.replaceExisting)}`,
    unsupportedHints.length > 0
      ? `- Known unsupported-scope hints already detectable from the brief: ${unsupportedHints.join(", ")}.`
      : "- No unsupported-scope hints were pre-detected before orchestration.",
  ].join("\n");
}

export async function orchestrateChatPiPi(
  input: ChatPiPiInput,
  runtimeHints?: unknown,
): Promise<ChatPiPiOutput> {
  const state = getOrCreateChatPiPiConversationState(input, runtimeHints);
  const childRuntime = getOrCreateChildRuntime(state, runtimeHints);
  const session = await ensureConversationSession(state, runtimeHints);

  const runId = childRuntime.beginRun();
  childRuntime.emitStatus("running", "pi-pi child session started delegated work");

  try {
    await session.prompt(buildOrchestratorPrompt(input, state), {
      expandPromptTemplates: false,
      source: "extension",
    });

    state.updatedAt = Date.now();
    const output = validateChatPiPiOutput(parseChatPiPiOutput(getLastAssistantText(session.messages)));
    childRuntime.emitStatus(
      output.status === "clarification_needed" ? "waiting_user" : "completed",
      output.status === "clarification_needed"
        ? "waiting for user reply"
        : "delegated conversational turn completed",
    );
    return output;
  } catch (error) {
    childRuntime.emitStatus("failed", undefined, {
      code: error instanceof Error ? error.name : "EXECUTION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    childRuntime.endRun(runId);
  }
}

export function isChatPiPiOrchestrationUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no model|api key|credential|auth|provider|model selected|return an object|invalid status|reply string|unexpected end of json input|unexpected token/i.test(message);
}

export function buildFallbackHelpReply(): ChatPiPiOutput {
  return {
    status: "completed",
    reply:
      "I am pi-pi, the chat-first authoritative builder for certified Pi Protocol packages. Describe the capability you want and, optionally, a repoDir. I return clarification_needed when I need more information or destructive confirmation, unsupported when the ask is outside current certified package scope, and completed when I finish the build path with nested source_validated or runtime_verified details.",
  };
}

export function maybeFallbackToDirectHelp(message: string): ChatPiPiOutput | null {
  const lower = normalizeWhitespace(message.toLowerCase());
  const asksQuestion = lower.includes("?") || /\b(what|how|who|help)\b/.test(lower);
  const mentionsPiPi = /\b(you|your|pi-pi)\b/.test(lower);
  const explicitBuildIntent = /\b(build|create|make|generate|implement|scaffold)\b/.test(lower);

  if (asksQuestion && mentionsPiPi && !explicitBuildIntent) {
    return buildFallbackHelpReply();
  }

  return null;
}

export {
  __resetChatPiPiConversationStoreForTests,
  closeChatPiPiConversation,
  getChatPiPiConversationToken,
} from "./chat-conversation-store.ts";
