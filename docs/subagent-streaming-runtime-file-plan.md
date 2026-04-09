# Subagent streaming runtime file plan

## Why this doc exists

This is a compact execution doc for the next session.

It is intended to increase implementation success by answering two concrete questions up front:

1. what exact runtime events should exist?
2. which files should change, and in what order?

This is intentionally shorter and more operational than `docs/subagent-runtime-implementation-policy.md`.

## Recommended scope

Implement the minimum viable runtime needed for:

- inherited core tools in delegated conversational child sessions
- recursive live streaming to the user/harness
- explicit structured status updates
- preserved parent-context opacity

Do not redesign the public protocol surface for this pass.

## Minimum runtime event schema

Use a small structured event model first.

```ts
type SubagentRunStatus =
  | "queued"
  | "running"
  | "streaming"
  | "waiting_user"
  | "waiting_caller"
  | "completed"
  | "failed"
  | "cancelled";

interface SubagentEventBase {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  nodeId: string;
  provide: string;
  conversationToken?: string;
  depth: number;
  timestamp: number;
}

interface SubagentStatusEvent extends SubagentEventBase {
  kind: "subagent_status";
  status: SubagentRunStatus;
  label?: string;
  breadcrumb?: string[];
  summary?: string;
  error?: { code?: string; message: string };
}

interface SubagentMessageDeltaEvent extends SubagentEventBase {
  kind: "subagent_message_delta";
  messageId: string;
  delta: string;
}

interface SubagentMessageCompletedEvent extends SubagentEventBase {
  kind: "subagent_message_completed";
  messageId: string;
  text: string;
}

interface SubagentToolEvent extends SubagentEventBase {
  kind: "subagent_tool_started" | "subagent_tool_updated" | "subagent_tool_completed";
  toolName: string;
  toolCallId?: string;
  summary?: string;
}
```

Keep the first pass small.
You can add richer event kinds later.

## Message types to emit to the UI/harness

Add custom-message channels for at least:

- `protocol-subagent-status`
- `protocol-subagent-stream`

Recommended division:

- `protocol-subagent-status`
  - durable lifecycle/status cards
  - queued/running/waiting/completed/failed
  - breadcrumb + ownership
- `protocol-subagent-stream`
  - live deltas/tool activity
  - recursive detail stream
  - intended to be collapsible/expandable

Keep existing:

- `protocol-handoff`
- `protocol-invoke-result`
- `protocol-conversation`

Do not remove current message types in the first pass.
Extend them.

## File-by-file implementation plan

### 1. `vendor/pi-protocol-sdk.ts`

This should be the primary runtime integration point.

Add:

- runtime event/status types for subagent streaming
- conversation/frame metadata extended with run status
- per-session recursive subagent runtime store
- emitters/helpers for:
  - status changes
  - streamed child deltas
  - streamed child tool activity
- renderer registration for:
  - `protocol-subagent-status`
  - `protocol-subagent-stream`
- harness-facing status emission path
- a dual-visibility model:
  - user/harness verbose
  - parent-context opaque

Important implementation rule:

- stream events must be structured runtime events, not inferred from assistant prose

Recommended helper groups inside the SDK:

- subagent status types/interfaces
- per-target recursive runtime state
- event emitters
- message renderers
- recursive breadcrumb helpers

### 2. `protocol/chat-orchestrator.ts`

This file should become the first real delegated-child-session implementation site.

Change it so that the child session:

- inherits the parent’s core tools
- inherits protocol delegation capability
- subscribes to child session message/tool lifecycle events
- forwards those events into the runtime stream helpers
- preserves current persistent session-by-token behavior

Important:

- do not just add `inspect_build_target` and `execute_certified_build`
- the child session should get the real coding/protocol tool surface too

If needed, split this file into:

- `protocol/chat-conversation-store.ts`
- `protocol/chat-orchestrator.ts`

and keep the streaming bridge in the orchestrator side.

### 3. `extensions/projection.ts`

Extend projection rendering to show delegated workflow more clearly.

Add renderers for:

- `protocol-subagent-status`
- `protocol-subagent-stream`

Required behavior:

- collapsed: owner + status + breadcrumb summary
- expanded: nested workflow details
- recursive children remain visibly nested
- `ctrl+o` expansion works naturally through the custom renderer details

Do not stuff verbose subagent stream text into plain notify calls except as fallback.

### 4. `extensions/runtime.ts`

Keep this file minimal.

Ensure runtime startup wires:

- any needed session-scoped recursive subagent state
- reset behavior on session start/shutdown
- renderer/tool registration remains idempotent

### 5. tests

Add/extend tests in:

- `scripts/test-chat-continuation.ts`
- `scripts/test-conversation-routing.ts`
- `scripts/test-handoff.ts`
- `scripts/test-regressions.ts`
- `scripts/test-sdk-session.ts`

Minimum new assertions:

- delegated child sessions have inherited core tools available
- child message/tool activity emits visible structured stream events
- waiting/completed/failed states update live
- recursive nested delegation emits nested breadcrumb/status info
- parent-visible final result behavior still works
- expanded/collapsed message types are registered and emitted

## Recommended implementation order

1. add subagent status/event types to `vendor/pi-protocol-sdk.ts`
2. add message emission helpers for status + stream
3. add renderers for new message types
4. wire `protocol/chat-orchestrator.ts` child session event forwarding
5. wire inherited core tools into child session creation
6. add recursive breadcrumb/status propagation
7. add tests
8. validate and only then refine UX formatting

## Known risk points

### Risk 1 — tool inheritance in child sessions

The biggest technical risk is correctly inheriting parent tools into child sessions created through the Pi agent SDK.

Do not guess.
Inspect how the current top-level session tool set is exposed and choose the cleanest supported inheritance path.

### Risk 2 — leaking child internals into parent prompt context

Be careful not to confuse:

- visible UI/harness stream
- prompt-visible parent agent context

The first should be verbose.
The second should remain mostly final-output-only.

### Risk 3 — duplicate lifecycle/status artifacts

Avoid emitting the same logical state through too many message types at once.

In the first pass:

- status cards should represent lifecycle state
- stream cards should represent live details
- invoke result cards should represent final surfaced result

## Validation

Minimum:

- `npm run typecheck`
- `npm run test:chat-continuation`
- `npm run test:conversation`
- `npm run test:handoff`
- `npm run test:regressions`
- `npm run test:sdk-session`

If you touch builder behavior too:

- `npm run test:certified-builder`

## Definition of success for this pass

This pass succeeds if:

- a delegated conversational child can actually inspect/edit/run/delegate
- the user can watch it work live
- nested delegated work is visible recursively
- the harness gets live status changes
- the parent agent still mostly sees only the child’s final output
