# Subagent conversation continuity implementation plan

## Purpose

This document defines the implementation plan for turning one-shot protocol handoff into real multi-turn delegated conversation with clear speaker ownership, recursion support, and explicit continuation semantics.

## Problem statement

The current system is still fundamentally request/response:

- the main agent invokes a node provide once
- the callee returns one result
- the parent agent tries to relay or paraphrase that result
- the next user turn is not owned by the callee in any durable way

That causes several UX failures:

- the user cannot reliably tell who they are talking to
- the parent agent often paraphrases after the callee already answered
- follow-up turns are not routed back to the same callee consistently
- recursive delegation cannot behave like a real conversation stack
- the callee does not currently retain a durable conversational child session across invokes

## Goals

Build a real delegated conversation model with all of the following:

- clear visible indication of who currently has the floor
- support for recursive delegation (`main -> subagent -> subagent`)
- explicit typed continuation semantics in protocol output
- explicit runtime ownership/routing of the next turn
- persistent per-conversation callee state across turns
- no package-specific runtime hacks for `pi-pi`
- generic support for conversational protocol provides

## Non-goals

- Do not make every protocol provide implicitly conversational.
- Do not make hidden host-specific behavior the only source of truth.
- Do not encode `pi-pi`-specific routing rules in the protocol runtime.
- Do not force every callee implementation to literally be a full Pi session unless that is the best local implementation.
- Do not solve this with more prompt heuristics alone.

## Final design decision

The correct model is a combination of:

1. **Protocol-level continuation contract**
2. **Runtime-level handoff ownership and routing**
3. **Persistent child-session implementation for agentic callees when appropriate**

In other words:

- protocol should carry typed continuation state
- runtime should manage the active conversation stack and next-turn routing
- callee internals may use resumable child sessions keyed by conversation token

## Why the current boolean idea is insufficient

A field like:

```ts
expectsReply: boolean
```

is too ambiguous. It does not say:

- who should reply next
- whether the reply should come from the user or the caller
- whether the conversation is still open
- which node currently owns the floor

That ambiguity will keep causing UX confusion.

## Required state model

Use an explicit continuation state instead of a boolean.

### Protocol continuation state

```ts
type ContinuationState = "awaiting_user" | "awaiting_caller" | "closed";
```

Semantics:

- `awaiting_user`
  - the callee has the floor
  - the next user turn should route back to this callee conversation
- `awaiting_caller`
  - the callee expects the caller/parent agent to continue orchestration
  - the next user turn should **not** route directly to the callee by default
- `closed`
  - no continuation is open
  - the floor returns to the parent/default agent

## Public contract shape

This should be generic for chat-like protocol provides, not specific to `pi-pi`.

### Input

```ts
interface ConversationalProvideInput {
  message: string;
  conversationToken?: string;
}
```

Notes:

- `message` remains the canonical natural-language input
- `conversationToken` resumes an existing delegated conversation
- non-conversational provides do not need to adopt this shape

### Output

```ts
interface ConversationalContinuation {
  token: string;
  state: "awaiting_user" | "awaiting_caller" | "closed";
  owner: {
    nodeId: string;
    provide: string;
    label?: string;
  };
}

interface ConversationalProvideOutput {
  status: string;
  reply: string;
  continuation?: ConversationalContinuation;
}
```

Notes:

- `continuation` is optional
- omit it for one-shot results if desired, or include it with `closed`
- `owner` identifies who currently owns the floor

## Ownership model

## Single source of truth

The active speaker/floor must be determined by runtime state, not inferred only from prompt text.

### Runtime conversation stack

Maintain a per-parent-session stack like:

```ts
interface ActiveConversationFrame {
  token: string;
  nodeId: string;
  provide: string;
  label?: string;
  state: "awaiting_user" | "awaiting_caller" | "closed";
}
```

Example recursive stack:

```ts
[
  { nodeId: "main", provide: "chat", token: "root", state: "awaiting_user" },
  { nodeId: "pi-pi", provide: "chat_pi_pi", token: "a1", state: "awaiting_user" },
  { nodeId: "url-worker", provide: "chat_url_worker", token: "b2", state: "awaiting_user" }
]
```

Top of stack owns the floor.

### Stack rules

- push when a callee opens a new continuation
- update top frame when a callee continues the same token
- pop when a frame becomes `closed`
- if a child closes, control returns to the next frame below it
- if the stack empties, control returns to the main/default agent

## UI requirements

The UI must clearly indicate who the user is talking to right now.

### Required visible indicators

Show all of the following:

- current speaker / owner of the floor
- recursive path / breadcrumb
- whether the turn is currently delegated or back at main

### Recommended UX

Examples:

- `Talking to: main agent`
- `Talking to: pi-pi`
- `Talking to: url-worker`

Breadcrumb path:

- `main`
- `main > pi-pi`
- `main > pi-pi > url-worker`

### Message attribution

Every surfaced conversational invoke result should be attributable to the callee.

Examples:

- `pi-pi.chat_pi_pi`
- `url-worker.chat_url_worker`

This attribution should remain visible even when expanded details are hidden.

## Runtime routing requirements

### If top frame is `awaiting_user`

- next user message routes to that frame's `nodeId` + `provide`
- the parent agent should not reinterpret the turn first
- the UI should continue to show that callee as active

### If top frame is `awaiting_caller`

- parent/main agent receives control
- the callee result is available as context, but the user is not directly talking to that callee

### If top frame is `closed`

- pop the frame
- continue routing according to the next frame below or to main if none remains

### Manual override

The user must always be able to break out and redirect.

Examples:

- `back`
- `/cancel-handoff`
- explicit mention of another target or general main-agent request

Exact UX command can be decided later, but escape/override behavior must exist.

## Persistent state requirement

The current `chat_pi_pi` implementation uses a fresh in-memory child session per invoke and disposes it immediately. That is not sufficient.

### Required change

For agentic conversational provides, store per-conversation state keyed by:

- parent/root session identity
- callee node id
- provide name
- conversation token

### Acceptable implementations

#### Option A — full child AgentSession per open conversation

Pros:

- strongest continuity model
- natural reuse of existing session/memory behavior
- easiest path for rich recursive agentic nodes

Cons:

- heavier runtime cost
- needs lifecycle management and cleanup

#### Option B — lighter-weight node-local conversation store + regenerated ephemeral child agent

Pros:

- cheaper than a full child session
- may be sufficient for deterministic or mostly-structured nodes

Cons:

- harder to make truly conversational
- more custom state stitching

### Recommendation

Use **full child AgentSession per open conversational agentic node** where the node really behaves like a subagent.

Important:

- this should be an **implementation choice**, not a universal protocol rule
- some nodes may not need a full child session

## Protocol/runtime boundary

### Protocol should standardize

- continuation token
- continuation state
- owner identity
- normal result semantics

### Runtime should standardize

- active conversation stack
- next-turn routing
- visible speaker indicator
- recursive breadcrumb rendering
- floor transfer and return

### Callee internals should remain local

- whether the callee uses a full child AgentSession
- how it stores internal prompt state
- how it summarizes old child turns
- whether it uses deterministic helpers, tools, or sub-subagents

## Recursion rules

Recursion is supported.

### Required properties

- any conversational node may open a child conversation with another node
- each child gets its own continuation token
- runtime stack depth must be bounded
- breadcrumbs must reflect nesting
- popping child ownership must restore the immediate parent, not jump straight to main

### Failure handling

If a nested child fails:

- preserve the stack above it
- surface failure in the child frame
- decide whether the parent frame becomes `awaiting_caller` or `closed`
- do not silently flatten the entire stack

## Handoff lifecycle integration

This new conversation model should complement current handoff lifecycle UI rather than replace it.

Keep:

- compact handoff lifecycle status
- opaque internal detail support
- structured trace/span provenance

Add:

- durable post-handoff conversational ownership
- active speaker indicator
- continued routing after a callee asks a follow-up question

## Proposed file-level changes

### 1. `protocol/contracts.ts`

Add generic continuation types:

- `ContinuationState`
- `ConversationalContinuation`
- optional continuation field on chat-like outputs

### 2. `protocol/schemas/chat_pi_pi.input.json`

Add optional:

- `conversationToken`

### 3. `protocol/schemas/chat_pi_pi.output.json`

Add optional:

- `continuation.token`
- `continuation.state`
- `continuation.owner`

### 4. `protocol/chat.ts`

Update `chat_pi_pi` to:

- accept `conversationToken`
- resume child state when provided
- emit explicit continuation state
- close or continue the conversation intentionally

### 5. `protocol/chat-orchestrator.ts`

Replace one-shot child-session behavior with resumable conversation state.

Required changes:

- stop creating throwaway child sessions for every turn
- key child state by conversation token
- restore the correct child session on continuation
- only dispose child sessions when the conversation closes

### 6. `vendor/pi-protocol-sdk.ts`

Add runtime support for:

- active conversation stack tracking
- visible speaker/breadcrumb indicator rendering
- routing next user turn to active callee when state is `awaiting_user`
- returning control when a frame closes
- recursion-safe stack push/pop behavior

### 7. `extensions/projection.ts`

If slash commands remain relevant, ensure they can:

- enter a delegated conversation cleanly
- respect ownership state
- show the same active-speaker UX as protocol-driven routing

### 8. `extensions/runtime.ts`

Likely minimal changes, but runtime startup must initialize any needed session-scoped conversation store safely.

### 9. Tests

Add or extend tests for:

- continuation token round-trip
- `awaiting_user` routing
- `awaiting_caller` routing
- `closed` frame pop behavior
- recursive stack behavior
- visible speaker indicator rendering
- child-session persistence across turns
- manual break-out/redirect behavior

## Suggested output semantics for `chat_pi_pi`

### Example: help question with closed continuation

```json
{
  "status": "completed",
  "reply": "I can build certified Pi Protocol packages and explain how to use me.",
  "continuation": {
    "token": "tok-1",
    "state": "closed",
    "owner": { "nodeId": "pi-pi", "provide": "chat_pi_pi", "label": "pi-pi" }
  }
}
```

### Example: callee asks user for more detail

```json
{
  "status": "clarification_needed",
  "reply": "What kind of package do you want me to build?",
  "questions": ["What should the package do?"],
  "continuation": {
    "token": "tok-2",
    "state": "awaiting_user",
    "owner": { "nodeId": "pi-pi", "provide": "chat_pi_pi", "label": "pi-pi" }
  }
}
```

### Example: worker returns control to parent

```json
{
  "status": "completed",
  "reply": "I inspected the repo and found two candidate capabilities.",
  "continuation": {
    "token": "tok-3",
    "state": "awaiting_caller",
    "owner": { "nodeId": "repo-worker", "provide": "inspect_repo", "label": "repo-worker" }
  }
}
```

## Runtime behavior examples

### Example A — direct delegated conversation

1. user asks main agent to ask `pi-pi`
2. main invokes `pi-pi.chat_pi_pi`
3. `pi-pi` replies with `awaiting_user`
4. runtime marks `pi-pi` as active speaker
5. next user turn routes directly to `pi-pi` with the same `conversationToken`

### Example B — recursive delegation

1. main asks `pi-pi`
2. `pi-pi` asks `url-worker`
3. `url-worker` replies with `awaiting_user`
4. runtime shows `main > pi-pi > url-worker`
5. user replies
6. reply routes to `url-worker`
7. worker closes
8. runtime pops back to `pi-pi`

## Compatibility policy

This feature materially changes conversational behavior.

Recommended policy:

- do not preserve ambiguous boolean continuation aliases
- move directly to explicit continuation states
- keep the model small and typed

## Implementation phases

### Phase 1 — Add protocol continuation types

- add `conversationToken` to relevant chat-like inputs
- add typed continuation object to outputs
- update schemas and docs

Success check:

- conversational provides can express `awaiting_user`, `awaiting_caller`, and `closed`

### Phase 2 — Add runtime conversation stack

- track active conversation frames per session
- push/pop/update frames correctly
- expose visible active speaker and breadcrumb state

Success check:

- runtime always knows who has the floor

### Phase 3 — Make `chat_pi_pi` resumable

- persist child session/state by token
- stop disposing state after every invoke
- resume the same child context on next delegated turn

Success check:

- repeated turns actually continue the same `pi-pi` conversation

### Phase 4 — Add next-turn routing

- when state is `awaiting_user`, route next user turn to active callee
- when state is `awaiting_caller`, route back to caller/main agent
- when `closed`, pop and return control upward

Success check:

- visible A -> B -> A -> B behavior works without paraphrase hacks

### Phase 5 — Add recursion-safe UX

- breadcrumb / stack indicator
- nested ownership transitions
- child close returns to immediate parent

Success check:

- recursive delegation is understandable in the UI

### Phase 6 — Clean up prompt heuristics

- remove now-unnecessary relay heuristics that were compensating for missing ownership
- keep only minimal guidance for protocol discovery and attribution

Success check:

- less prompt bloat, less relay confusion

## Test plan

### Required new tests

- `chat_pi_pi` returns continuation state intentionally
- same conversation token resumes the same child state
- `awaiting_user` routes next user turn to callee
- `awaiting_caller` returns control to parent
- `closed` pops ownership stack
- recursive child stack is displayed and routed correctly
- visible current-speaker indicator changes on ownership transitions
- parent agent does not paraphrase when callee owns the floor
- manual redirect exits delegated conversation cleanly

## Docs to update after implementation

- `README.md`
- `docs/ARCHITECTURE.md`
- `CONTRIBUTING.md`
- any user-facing docs for handoff / protocol chat behavior

## Definition of done

This work is done when all of the following are true:

- the user can clearly see whether they are talking to main or a delegated node
- delegated conversations can continue across turns without losing callee state
- recursive delegation is supported with clear breadcrumbs
- protocol outputs explicitly state `awaiting_user`, `awaiting_caller`, or `closed`
- runtime routes the next turn based on that state
- agentic callees can keep persistent conversation state behind a continuation token
- the system no longer relies on prompt nudges alone to fake subagent continuity
