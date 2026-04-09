import path from "node:path";
import type { createAgentSession } from "@mariozechner/pi-coding-agent";
import type { ChatPiPiInput } from "./contracts.ts";
import type { ProtocolChildSessionRuntime } from "../extensions/protocol-child-session.ts";

export type AgentSessionHandle = Awaited<ReturnType<typeof createAgentSession>>["session"];

export interface RuntimeHints {
  model?: unknown;
  thinkingLevel?: unknown;
  modelRegistry?: unknown;
  settingsManager?: unknown;
  createAgentSession?: typeof createAgentSession;
  protocolSessionPi?: unknown;
  protocolDelegate?: unknown;
  protocolTraceId?: string;
  protocolSpanId?: string;
  protocolParentSpanId?: string;
  protocolDepth?: number;
}

export interface ChatPiPiConversationState {
  token: string;
  workingDir: string;
  session?: AgentSessionHandle;
  childRuntime?: ProtocolChildSessionRuntime;
  subagentSpanId: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatPiPiConversationStoreState {
  byRuntimeObject: WeakMap<object, Map<string, ChatPiPiConversationState>>;
  byRuntimeFallback: Map<string, Map<string, ChatPiPiConversationState>>;
}

const CHAT_PI_PI_CONVERSATION_STORE_KEY = Symbol.for("pi-pi.chat-orchestrator.conversation-store");

function getConversationStoreState(): ChatPiPiConversationStoreState {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const existing = globals[CHAT_PI_PI_CONVERSATION_STORE_KEY] as ChatPiPiConversationStoreState | undefined;
  if (existing?.byRuntimeObject instanceof WeakMap && existing.byRuntimeFallback instanceof Map) {
    return existing;
  }

  const created: ChatPiPiConversationStoreState = {
    byRuntimeObject: new WeakMap<object, Map<string, ChatPiPiConversationState>>(),
    byRuntimeFallback: new Map<string, Map<string, ChatPiPiConversationState>>(),
  };
  globals[CHAT_PI_PI_CONVERSATION_STORE_KEY] = created;
  return created;
}

function toRuntimeObject(value: unknown): object | null {
  return (typeof value === "object" || typeof value === "function") && value !== null ? value : null;
}

function getRuntimeKey(runtimeHints: unknown): object | string {
  const hints = (runtimeHints ?? {}) as RuntimeHints;
  return toRuntimeObject(hints.protocolSessionPi) ?? toRuntimeObject(runtimeHints) ?? "default-runtime";
}

function getConversationStore(runtimeHints?: unknown): Map<string, ChatPiPiConversationState> {
  const state = getConversationStoreState();
  const runtimeKey = getRuntimeKey(runtimeHints);

  if (typeof runtimeKey === "string") {
    const existing = state.byRuntimeFallback.get(runtimeKey);
    if (existing) return existing;
    const created = new Map<string, ChatPiPiConversationState>();
    state.byRuntimeFallback.set(runtimeKey, created);
    return created;
  }

  const existing = state.byRuntimeObject.get(runtimeKey);
  if (existing) return existing;
  const created = new Map<string, ChatPiPiConversationState>();
  state.byRuntimeObject.set(runtimeKey, created);
  return created;
}

function resolveConversationToken(input: ChatPiPiInput): string {
  return input.conversationToken?.trim() || crypto.randomUUID();
}

export function getChatPiPiConversationToken(input: ChatPiPiInput): string {
  return resolveConversationToken(input);
}

export function getOrCreateChatPiPiConversationState(
  input: ChatPiPiInput,
  runtimeHints?: unknown,
): ChatPiPiConversationState {
  const store = getConversationStore(runtimeHints);
  const token = resolveConversationToken(input);
  const now = Date.now();
  const requestedWorkingDir = path.resolve(input.repoDir?.trim() || process.cwd());
  const existing = store.get(token);

  if (existing) {
    existing.updatedAt = now;
    if (input.repoDir?.trim()) {
      existing.workingDir = requestedWorkingDir;
    }
    return existing;
  }

  const created: ChatPiPiConversationState = {
    token,
    workingDir: requestedWorkingDir,
    subagentSpanId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  store.set(token, created);
  return created;
}

export async function closeChatPiPiConversation(token: string | undefined, runtimeHints?: unknown): Promise<void> {
  if (!token) return;

  const store = getConversationStore(runtimeHints);
  const state = store.get(token);
  if (!state) return;

  try {
    state.session?.dispose();
    state.childRuntime = undefined;
  } finally {
    store.delete(token);
  }
}

export function __resetChatPiPiConversationStoreForTests(): void {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const existing = globals[CHAT_PI_PI_CONVERSATION_STORE_KEY] as ChatPiPiConversationStoreState | undefined;
  if (!existing) {
    return;
  }

  for (const store of existing.byRuntimeFallback.values()) {
    for (const conversation of store.values()) {
      conversation.session?.dispose();
    }
  }
  existing.byRuntimeFallback.clear();
  globals[CHAT_PI_PI_CONVERSATION_STORE_KEY] = {
    byRuntimeObject: new WeakMap<object, Map<string, ChatPiPiConversationState>>(),
    byRuntimeFallback: new Map<string, Map<string, ChatPiPiConversationState>>(),
  } satisfies ChatPiPiConversationStoreState;
}
