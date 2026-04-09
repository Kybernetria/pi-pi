# Subagent runtime implementation policy

## Purpose

This document defines the implementation policy for making delegated conversational nodes behave like real recursive subagents instead of one-shot wrappers.

It focuses on four requirements:

1. full core tool access for agentic subagents
2. recursive live streaming of subagent work
3. strict separation between user-visible workflow and parent-agent context boundaries
4. accurate runtime/harness status updates for delegated work

## Product position

If a node can own the floor in a delegated multi-turn conversation, it must be able to do real autonomous work.

That means a conversational delegated node is not just a typed protocol endpoint. It is a resumable child agent with:

- durable conversation ownership
- real tools
- recursive delegation ability
- visible live execution workflow

Without that, delegation is theatrical rather than modular.

## Core policy

### Rule 1 — conversational subagents get the full core tool surface by default

Any node/session that can return conversational continuation state and especially any node that returns:

- `awaiting_user`
- `awaiting_caller`

must, by default, receive the same core tool surface as the parent agent runtime.

Minimum default inherited tools:

- `read`
- `write`
- `edit`
- `bash`
- `protocol`

If the parent runtime exposes more standard coding tools, the default should be inheritance rather than redefinition.

### Rule 2 — deterministic specialist provides do not automatically get full tools

This policy is not universal for all provides.

- deterministic machine-oriented provides may use a narrow local tool set
- agentic conversational provides must use inherited core tools unless explicitly sandboxed

### Rule 3 — tool restriction must be explicit, not accidental

If a conversational subagent does not receive a core tool, that must be because of an explicit sandbox policy.
It must not happen because the runtime forgot to wire the child session correctly.

## Tool inheritance model

### Parent-to-child inheritance

When the runtime creates a child agent session for a conversational delegated node, it should inherit:

- the active core tools available to the parent session
- the protocol tool projection
- any runtime-safe standard helpers already available to the parent
- model and budget constraints as already implemented

### Required inheritance behavior

A child conversational session should be able to:

- inspect repository files directly
- edit files directly when appropriate
- run validation/build/test commands directly
- ask other protocol nodes recursively
- continue across turns with the same child session state

### Recommended runtime API shape

The runtime should have an explicit child-session tool inheritance path, conceptually like:

```ts
interface ChildSessionToolPolicy {
  inheritCoreTools: true;
  inheritProtocolTool: true;
  inheritedToolNames?: string[];
  blockedToolNames?: string[];
}
```

The exact API name can differ, but the policy must be explicit in code.

## Visibility model

## Single important distinction

There are two different audiences:

1. the user / host UI / harness
2. the parent agent LLM context

These must not be conflated.

### User-visible workflow

By default, conversational delegated subagents should be fully verbose to the user.

That means the user should be able to see:

- the subagent starting
- which node currently owns the floor
- live status updates while it works
- tool activity and nested delegation structure
- recursive child activity
- completion/failure/waiting states

### Parent-agent context visibility

The parent agent should not automatically receive all of the subagent’s internal streamed details in its LLM context.

By default, the parent gets:

- the child’s final protocol result
- structured continuation state
- optionally structured trace/provenance metadata outside normal language context

The parent should not get the entire verbose live stream as normal prompt text.

### Summary rule

- **verbose to user by default**
- **opaque to parent context by default**

This is the required model.

## Streaming policy

### Rule 4 — delegated subagents stream live by default

A conversational delegated subagent should stream live execution to the UI/harness by default.

This includes:

- assistant text deltas from the child session
- tool start/update/end events
- nested handoff/delegation events
- waiting/clarification states
- success/failure transitions

### Rule 5 — streaming must be recursive

If:

- `main -> subagent A -> subagent B`

then the user should be able to observe that recursive workflow while it happens.

The stream model must preserve nesting.

### Rule 6 — recursion must stay collapsible

The UI must preserve the current ability to expand/collapse with `ctrl+o`.

Required UX:

- collapsed view shows a compact handoff/subagent status item
- expanded view shows nested live workflow details
- nested subagent activity is grouped beneath its parent
- users can open/close recursive work without losing the hierarchy

### Rule 7 — default verbosity is on

Conversational subagents should be verbose by default for the user-facing stream.
Do not require hidden debug flags just to see what the delegated node is doing.

If a future policy adds “quiet mode,” it must be opt-out from this verbose default, not the other way around.

## Streaming event model

The runtime should expose a recursive event stream with durable identity.

### Required event kinds

At minimum, the runtime should emit events for:

- `subagent_started`
- `subagent_status`
- `subagent_message_delta`
- `subagent_message_completed`
- `subagent_tool_started`
- `subagent_tool_updated`
- `subagent_tool_completed`
- `subagent_waiting`
- `subagent_completed`
- `subagent_failed`
- `subagent_cancelled`

### Required event identity

Every streamed event should include enough information to reconstruct the tree:

```ts
interface SubagentStreamEventBase {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  nodeId: string;
  provide: string;
  conversationToken?: string;
  depth: number;
  timestamp: number;
}
```

### Required status states

At minimum:

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
```

## Harness policy

### Rule 8 — the harness must receive live status updates

The current harness/status path is not sufficient if the user cannot see what the subagent is doing while it runs.

The runtime must emit status changes in real time to the harness, not just final result messages.

That means:

- start events must be visible immediately
- tool activity should update while the child is running
- waiting states should be surfaced immediately
- completion/failure should close the active status item cleanly

### Rule 9 — status is runtime state, not inferred from prose

Do not try to infer subagent status from generated text.

The runtime should track explicit status and stream it as structured events.

### Rule 10 — harness visibility is not the same as prompt injection

The harness should receive full recursive status and workflow detail.
This does not mean those details should be appended into the parent agent’s prompt.

## Message attribution policy

Every visible subagent output should remain attributable.

Required attribution:

- `nodeId`
- `provide`
- label if present
- breadcrumb path for nested delegation

Examples:

- `pi-pi.chat_pi_pi`
- `pi-pi.chat_pi_pi > url-worker.chat_url_worker`

## Child session model

### Rule 11 — conversational subagents use durable child sessions

If a node is acting as a delegated conversational subagent, it should use a persistent child session keyed by continuation/conversation identity.

That child session should hold:

- its own message history
- its inherited tools
- its own live streaming state
- recursive child delegation state if it delegates further

### Rule 12 — child sessions are the source of streamed activity

Live streaming should come from the actual child session/tool events, not from fake synthesized summaries after the fact.

## Opacity policy

Opacity now needs two independent controls.

### Context opacity

Controls whether child internals flow into the parent agent’s LLM context.

Default for delegated conversational work:

- opaque to parent context

### UI visibility

Controls whether the user/harness can see the live workflow.

Default for delegated conversational work:

- visible and verbose

These must not be bound to one boolean.

Conceptually:

```ts
interface DelegationVisibilityPolicy {
  contextOpacity: "opaque" | "transparent";
  uiVisibility: "verbose" | "compact" | "hidden";
}
```

Default recommended value for conversational subagents:

```ts
{
  contextOpacity: "opaque",
  uiVisibility: "verbose"
}
```

## Runtime requirements

The runtime must support all of the following:

1. child-session creation with inherited tools
2. recursive child-session creation
3. explicit active speaker / floor ownership
4. recursive streaming to the harness/UI
5. collapsible nested workflow rendering
6. final-output-only return to parent context
7. explicit structured status updates
8. continuation-based resumption of the same child session

## UI requirements

The UI should show:

- `Talking to: <owner>`
- breadcrumb path
- current status of the active delegated node
- nested streamed workflow when expanded
- compact summary when collapsed

Required behavior:

- `ctrl+o` expands/collapses delegated workflow details
- collapsing hides detail, not ownership/status
- recursive children remain nested when expanded

## Failure handling

If a subagent or nested child fails:

- stream the failure visibly to the user/harness
- keep provenance and breadcrumb information
- preserve the parent stack where possible
- return a structured failure/final result upward according to protocol semantics
- do not silently discard streamed progress that already happened

## What should change first

### Phase 1 — tool inheritance for child sessions

Implement full inherited core tools for conversational child sessions.

Success condition:

- a delegated conversational node can inspect, edit, run commands, and invoke protocol nodes autonomously

### Phase 2 — recursive live streaming

Hook child-session message/tool events into a recursive UI/harness stream.

Success condition:

- the user can see what a delegated node is doing while it works

### Phase 3 — explicit harness status updates

Add structured status emission for subagent lifecycle and tool activity.

Success condition:

- the harness no longer only shows final outcomes

### Phase 4 — dual visibility model

Separate parent-context opacity from user/harness verbosity.

Success condition:

- child work stays visible to the user but does not spam the parent LLM context

## Test plan

Required tests should cover:

- inherited `read`, `write`, `edit`, `bash`, and `protocol` in delegated child sessions
- recursive child delegation with inherited tools
- live child message streaming
- live child tool event streaming
- recursive breadcrumb rendering
- `ctrl+o` collapse/expand preserving hierarchy
- harness status updates across queued/running/waiting/completed/failed
- parent context receiving only final child output by default
- continuation resuming the same child session and stream identity

## Definition of done

This work is done when all of the following are true:

- conversational subagents can actually inspect and modify repos on their own
- recursive delegated nodes can invoke other nodes with the same core tool surface
- the user can watch subagents work live by default
- recursive subagent work is collapsible/expandable in the UI
- the harness receives real-time delegated status updates
- parent agent context still receives only the child’s final output by default
- subagents feel like real modular recursive workers rather than thin wrappers
