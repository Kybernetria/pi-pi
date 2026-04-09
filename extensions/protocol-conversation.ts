import {
  PROTOCOL_CONVERSATION_MESSAGE_TYPE,
  PROTOCOL_CONVERSATION_STATE_KEY,
  type ProtocolActiveConversationFrame,
  type ProtocolAgentProjectionTarget,
  type ProtocolConversationContinuation,
  type ProtocolConversationController,
  type ProtocolConversationMessageDetails,
  type ProtocolConversationSnapshot,
  type ProtocolSessionPi,
} from "../vendor/pi-protocol-sdk.ts";

export type ProtocolConversationResetMode = "all" | "active-frame";

interface ProtocolConversationRuntimeState {
  frames: ProtocolActiveConversationFrame[];
  lastFingerprint?: string;
}

interface ProtocolConversationStoreState {
  runtimeByTarget: WeakMap<object, ProtocolConversationRuntimeState>;
}

function getConversationStoreState(): ProtocolConversationStoreState {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const existing = globals[PROTOCOL_CONVERSATION_STATE_KEY] as ProtocolConversationStoreState | undefined;
  if (existing?.runtimeByTarget instanceof WeakMap) {
    return existing;
  }

  const created: ProtocolConversationStoreState = {
    runtimeByTarget: new WeakMap<object, ProtocolConversationRuntimeState>(),
  };
  globals[PROTOCOL_CONVERSATION_STATE_KEY] = created;
  return created;
}

function toConversationTarget(value: unknown): object | null {
  return (typeof value === "object" || typeof value === "function") && value !== null ? value : null;
}

function getConversationRuntimeState(
  target: ProtocolSessionPi | ProtocolAgentProjectionTarget | object | null,
): ProtocolConversationRuntimeState | null {
  const registrationTarget = toConversationTarget(target);
  if (!registrationTarget) {
    return null;
  }

  const store = getConversationStoreState();
  const existing = store.runtimeByTarget.get(registrationTarget);
  if (existing) {
    return existing;
  }

  const created: ProtocolConversationRuntimeState = {
    frames: [],
  };
  store.runtimeByTarget.set(registrationTarget, created);
  return created;
}

function getActiveProtocolConversationFrame(
  state: ProtocolConversationRuntimeState,
): ProtocolActiveConversationFrame | undefined {
  for (let index = state.frames.length - 1; index >= 0; index -= 1) {
    const frame = state.frames[index];
    if (frame.state === "awaiting_user") {
      return frame;
    }
  }

  return undefined;
}

function toProtocolConversationSnapshot(
  state: ProtocolConversationRuntimeState | null,
): ProtocolConversationSnapshot {
  const activeFrame = state ? getActiveProtocolConversationFrame(state) : undefined;
  const activeIndex = activeFrame ? state?.frames.findIndex((frame) => frame.token === activeFrame.token) ?? -1 : -1;
  const activeFrames = activeIndex >= 0 ? state?.frames.slice(0, activeIndex + 1) ?? [] : [];
  const breadcrumb = ["main", ...activeFrames.map((frame) => frame.label || frame.nodeId)];

  return {
    delegated: !!activeFrame,
    ownerLabel: activeFrame?.label || activeFrame?.nodeId || "main agent",
    breadcrumb,
    activeFrame,
    frames: state?.frames.map((frame) => ({ ...frame })) ?? [],
  };
}

function protocolConversationFingerprint(snapshot: ProtocolConversationSnapshot): string {
  return JSON.stringify({
    delegated: snapshot.delegated,
    ownerLabel: snapshot.ownerLabel,
    breadcrumb: snapshot.breadcrumb,
    activeFrame: snapshot.activeFrame,
  });
}

function renderProtocolConversationSummary(snapshot: ProtocolConversationSnapshot): string {
  const owner = snapshot.delegated ? snapshot.ownerLabel : "main agent";
  const breadcrumb = snapshot.breadcrumb.join(" > ");
  return `Talking to: ${owner}${breadcrumb ? `\n${breadcrumb}` : ""}`;
}

function emitProtocolConversationMessage(
  projection: Pick<ProtocolAgentProjectionTarget, "sendMessage">,
  state: ProtocolConversationRuntimeState,
): void {
  if (!projection.sendMessage) {
    return;
  }

  const snapshot = toProtocolConversationSnapshot(state);
  const fingerprint = protocolConversationFingerprint(snapshot);
  if (state.lastFingerprint === fingerprint) {
    return;
  }

  state.lastFingerprint = fingerprint;
  projection.sendMessage({
    customType: PROTOCOL_CONVERSATION_MESSAGE_TYPE,
    content: renderProtocolConversationSummary(snapshot),
    display: true,
    details: {
      delegated: snapshot.delegated,
      ownerLabel: snapshot.delegated ? snapshot.ownerLabel : "main agent",
      breadcrumb: snapshot.breadcrumb,
      activeFrame: snapshot.activeFrame,
    } satisfies ProtocolConversationMessageDetails,
  });
}

export function getProtocolConversationSnapshot(
  target: ProtocolSessionPi | ProtocolAgentProjectionTarget,
): ProtocolConversationSnapshot {
  return toProtocolConversationSnapshot(getConversationRuntimeState(target));
}

export function resetProtocolConversationState(target: ProtocolSessionPi | ProtocolAgentProjectionTarget): void {
  const runtimeState = getConversationRuntimeState(target);
  if (!runtimeState) {
    return;
  }

  runtimeState.frames.length = 0;
  runtimeState.lastFingerprint = undefined;
}

export function applyProtocolConversationContinuation(
  projection: Pick<ProtocolAgentProjectionTarget, "sendMessage">,
  callerNodeId: string,
  continuation: ProtocolConversationContinuation | undefined,
): void {
  if (!continuation) {
    return;
  }

  const runtimeState = getConversationRuntimeState(projection);
  if (!runtimeState) {
    return;
  }

  const nextFrame: ProtocolActiveConversationFrame = {
    token: continuation.token,
    nodeId: continuation.owner.nodeId,
    provide: continuation.owner.provide,
    label: continuation.owner.label,
    state: continuation.state,
  };
  const existingIndex = runtimeState.frames.findIndex((frame) => frame.token === continuation.token);

  if (existingIndex >= 0) {
    if (continuation.state === "closed") {
      runtimeState.frames.splice(existingIndex);
    } else {
      runtimeState.frames[existingIndex] = nextFrame;
      runtimeState.frames.splice(existingIndex + 1);
    }
    emitProtocolConversationMessage(projection, runtimeState);
    return;
  }

  if (continuation.state === "closed") {
    emitProtocolConversationMessage(projection, runtimeState);
    return;
  }

  const parentIndex = [...runtimeState.frames]
    .map((frame, index) => ({ frame, index }))
    .reverse()
    .find(({ frame }) => frame.nodeId === callerNodeId)?.index ?? -1;

  if (parentIndex >= 0) {
    runtimeState.frames.splice(parentIndex + 1);
    runtimeState.frames.push(nextFrame);
  } else if (continuation.state === "awaiting_user") {
    runtimeState.frames.length = 0;
    runtimeState.frames.push(nextFrame);
  } else {
    runtimeState.frames.length = 0;
  }

  emitProtocolConversationMessage(projection, runtimeState);
}

export function clearProtocolConversationState(
  target: ProtocolSessionPi | ProtocolAgentProjectionTarget,
  mode: ProtocolConversationResetMode = "all",
): void {
  const runtimeState = getConversationRuntimeState(target);
  if (!runtimeState) {
    return;
  }

  if (mode === "all") {
    runtimeState.frames.length = 0;
  } else {
    const activeFrame = getActiveProtocolConversationFrame(runtimeState);
    if (!activeFrame) {
      return;
    }
    const activeIndex = runtimeState.frames.findIndex((frame) => frame.token === activeFrame.token);
    if (activeIndex >= 0) {
      runtimeState.frames.splice(activeIndex, 1);
    }
  }

  emitProtocolConversationMessage(target, runtimeState);
}

export function createProtocolConversationController(): ProtocolConversationController {
  return {
    applyContinuation(target, callerNodeId, continuation) {
      applyProtocolConversationContinuation(target, callerNodeId, continuation);
    },
  };
}
