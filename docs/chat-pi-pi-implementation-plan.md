# `chat_pi_pi` implementation plan

## Purpose

This document turns the current session conclusions into an implementation plan for simplifying `pi-pi` into a single chat-first protocol node.

## Final product decision

`pi-pi` should expose exactly one public provide:

- `chat_pi_pi`

That one provide must be the canonical entrypoint for:

- protocol invocation
- natural-language agent handoff
- `/chat-pi-pi` UI command projection

Everything else is local implementation detail.

Do not preserve the current planning/build/scaffolding split unless it is clearly the simplest robust shape.

## Non-negotiable rules

- Keep the public protocol surface to one provide: `chat_pi_pi`.
- Do not keep `build_certified_extension` public.
- Slash command and protocol handoff must target the same public contract.
- Clarification must be a typed normal outcome, not an error.
- Unsupported asks must be a typed normal outcome, not an error.
- Pi Protocol must not care about the internal workings of `pi-pi` beyond its standardized public input/output contract.
- If the current internal builder split is convoluted, simplify it. Internal determinism is only justified if it makes `pi-pi` more robust and easier to reason about.
- Do not re-expose planning/scaffolding/validation stages as protocol surface.
- Preserve runtime verification and the distinction between source validation and runtime verification.

## Anti-goals

- Do not add a second public provide for deterministic build execution.
- Do not keep public compatibility aliases for the old builder entrypoint.
- Do not expose planning, scaffolding, validation, or migration as public contracts.
- Do not make slash commands special-case routes that bypass the public protocol contract.
- Do not couple the public protocol design to the current internal module boundaries.

## Internal implementation rule

The protocol should standardize only inter-node communication:

- what input a public provide accepts
- what output it returns
- what outcomes are possible

The protocol should **not** standardize or care about `pi-pi`'s internal stages.

That means the current internal builder path should be treated as replaceable local code. If keeping a deterministic internal orchestrator is useful, keep it. If the current shape is too indirect or fragile, simplify it into a smaller local workflow. Do not preserve the current split just for continuity. The implementation should optimize for:

- robustness
- clarity
- testability
- minimal hidden complexity

## Target user experience

A user should be able to do either of the following and hit the same underlying contract.

### Protocol

```json
{
  "action": "invoke",
  "request": {
    "provide": "chat_pi_pi",
    "target": { "nodeId": "pi-pi" },
    "input": {
      "message": "Build me an extension that summarizes markdown notes and offers a local command.",
      "repoDir": "./packages/pi-notes"
    },
    "handoff": { "opaque": true }
  }
}
```

### UI

```text
/chat-pi-pi build me an extension that summarizes markdown notes and offers a local command
```

Both routes must use the same public provide and return the same classes of results.

## Public contract

### Input

```ts
interface ChatPiPiInput {
  message: string;
  repoDir?: string;
  applyChanges?: boolean;
  replaceExisting?: boolean;
}
```

Notes:

- `message` is required and is the canonical natural-language input.
- `repoDir` remains available for protocol callers and execution targeting.
- `applyChanges` remains an optional execution hint.
- `replaceExisting` remains an optional execution hint, but missing confirmation should usually produce clarification rather than a protocol error.
- Do not expose `allowPair` as public input.
- If collaboration or a manager/worker split is internally useful, `pi-pi` should decide that itself rather than exposing pair-selection as public protocol surface.

### Output

Use a single object schema with typed statuses rather than a schema union.

```ts
interface ChatPiPiOutput {
  status: "clarification_needed" | "completed" | "unsupported";
  reply: string;

  questions?: string[];
  missingInformation?: string[];
  assumptionsOffered?: string[];
  canProceedWithAssumptions?: boolean;

  reasons?: string[];

  build?: BuildCertifiedExtensionOutput;
}
```

The nested `build` field is allowed as output data, but it must not be treated as re-exposed public staging surface. If a thinner summary turns out to be simpler and clearer during implementation, that is acceptable too.

### Status semantics

#### `clarification_needed`

Use when the request is in scope but `pi-pi` cannot safely proceed yet.

Examples:

- existing repo found and replacement intent is unconfirmed
- target path is missing or ambiguous
- the desired public capability is too underspecified to build responsibly
- the request contains conflicting instructions

Guiding rule:

- clarify whenever proceeding would require destructive confirmation or would materially change the resulting public package contract beyond what the user reasonably asked for

#### `completed`

Use when `pi-pi` successfully completes the internal build path.

The nested `build` object may still report deterministic internal status such as:

- `source_validated`
- `runtime_verified`

#### `unsupported`

Use when the request is outside the current certified package scope.

Examples:

- live TUI/menu behavior
- bootstrap/preload interception
- current-session extension loading interception
- custom discovery outside supported certified package scope

## Clarification behavior

Clarification should replace current hard-failure paths wherever the ask is still in scope.

### Required clarification cases

#### Brownfield replacement confirmation

Current behavior throws unless `replaceExisting:true` is provided.

New behavior:

```json
{
  "status": "clarification_needed",
  "reply": "I found existing repository content in the target path. I can replace it with a certified package, but I need your confirmation first.",
  "questions": [
    "Should I replace the existing repository contents in /path/to/repo?"
  ],
  "missingInformation": [
    "replacement confirmation"
  ]
}
```

#### Empty or too-vague chat input

Example:

```json
{
  "status": "clarification_needed",
  "reply": "Tell me what kind of certified Pi package you want me to build.",
  "questions": [
    "What should the package do?",
    "Where should I build it?"
  ],
  "missingInformation": [
    "requested capability"
  ]
}
```

### Do not clarify unsupported asks

Unsupported asks should return `unsupported`, not a question flow.

## Public surface changes

## Manifest

Replace the only public provide in `pi.protocol.json`:

- remove `build_certified_extension`
- add `chat_pi_pi`

## Command projection

Replace the command projection:

- remove `/pi-pi-build-certified-extension`
- add `/chat-pi-pi`

The command should pass the raw remainder of the command as `message`, with only minimal trimming, so it behaves like normal chat rather than a command-only JSON envelope.

## Internal architecture target

Publicly, `pi-pi` should read as a simple chat-first builder node.

Internally, `pi-pi` may still use local helpers for:

- planning
- build orchestration
- scaffolding
- validation
- runtime smoke verification
- brownfield handling

But those should remain plain local modules/functions.

### Important internal simplification rule

Do not preserve the current internal builder shape just because it exists.

If the cleanest implementation is:

- a smaller public `chat.ts`
- a simplified local build orchestrator
- fewer translation layers between chat handling and build execution

then make that change.

The internal design should be judged by whether it is:

- smaller
- easier to maintain
- easier to test
- easier to explain
- more robust

not by whether it preserves existing module boundaries.

## Handoff and UI requirements

The current subagent/handoff UI needs to be fixed.

### Desired handoff behavior

When `chat_pi_pi` uses `ctx.handoff.run(...)`, the user should see one coherent handoff lifecycle for the call, not awkward fragmented artifacts.

The UI should clearly show:

- node
- provide
- brief if present
- running/done/failed status
- expandable details

Opaque handoffs should keep detailed internals redacted.

### Scope of the handoff fix

The handoff fix is a runtime/projection concern, not a protocol-surface expansion.

Keep:

- structured protocol entries
- handoff detail recording
- opaque/non-opaque behavior

Improve:

- visible lifecycle coherence
- renderer behavior
- duplicate/fragmented artifact handling

If the host UI cannot truly update prior handoff messages in place, implement the cleanest stable lifecycle presentation available rather than faking hidden behavior.

## File-by-file implementation plan

### 1. `pi.protocol.json`

Change the only public provide to `chat_pi_pi` and point it at new input/output schemas.

### 2. `protocol/contracts.ts`

Add:

- `ChatPiPiInput`
- `ChatPiPiOutput`

Keep internal build types if still useful, but stop treating them as the public-facing contract.

### 3. `protocol/schemas/chat_pi_pi.input.json`

Create a schema for:

- `message`
- optional `repoDir`
- optional `applyChanges`
- optional `replaceExisting`

### 4. `protocol/schemas/chat_pi_pi.output.json`

Create a schema for:

- `status`
- `reply`
- optional clarification fields
- optional unsupported reasons
- optional nested build result

### 5. `protocol/chat.ts` (new)

Create a focused public conversational entry module.

Responsibilities:

- normalize chat input
- detect unsupported asks
- detect clarification-needed cases
- call the local build path when enough information is present
- return `clarification_needed`, `completed`, or `unsupported`

### 6. `protocol/build.ts`

Keep only as internal orchestration if it remains useful.

Required changes:

- stop presenting this module as the public protocol contract
- adapt error-producing logic so the chat layer can convert in-scope failures into clarification when appropriate
- simplify the internal flow if the current indirection is unnecessary

### 7. `protocol/handlers.ts`

Export only:

- `chat_pi_pi`

Do not export a public `build_certified_extension` handler.

### 8. `protocol/core.ts`

Update documentation-style exports, examples, and notes so they teach the new chat-first public surface.

### 9. `extensions/projection.ts`

Replace the old command with `/chat-pi-pi`.

Behavior:

- pass raw command args as `message`
- invoke `chat_pi_pi`
- render typed conversational results cleanly

### 10. `extensions/runtime.ts`

Minimal changes expected. Ensure runtime registration stays session-safe.

### 11. `vendor/pi-protocol-sdk.ts`

Fix handoff lifecycle rendering so subagent-style work is presented coherently.

Key areas to inspect:

- `createProtocolNodeLocalHandoffSurface`
- handoff message emission
- handoff renderer registration
- visible renderer behavior

### 12. Documentation

Update:

- `README.md`
- `CONTRIBUTING.md`
- `docs/ARCHITECTURE.md`
- `TODO.md` if any listed item is actually completed during implementation

## Implementation phases

### Phase 1 — Flip the public contract

- manifest exposes only `chat_pi_pi`
- contracts and schemas exist
- old public builder surface is removed

Success check:

- protocol registry shows only `chat_pi_pi`

### Phase 2 — Add conversational orchestration

- `chat_pi_pi` handles natural-language input
- unsupported asks become typed `unsupported`
- in-scope missing info becomes typed `clarification_needed`
- successful build returns `completed`

Success check:

- representative examples produce the right typed status

### Phase 3 — Simplify internals

- keep or refactor the local build path based on what is actually simpler
- remove unnecessary translation layers
- keep deterministic behavior only where it improves reliability

Success check:

- internal flow is easier to explain and test than before

### Phase 4 — Restore command/protocol parity

- `/chat-pi-pi` projects the same public provide
- old command is removed

Success check:

- command and protocol return the same status classes and same public behavior

### Phase 5 — Fix handoff UI

- handoff lifecycle is coherent in the UI
- renderer remains idempotent
- details expand cleanly

Success check:

- handoff reads like one interaction instead of fragmented artifacts

### Phase 6 — Update docs and tests

- canonical docs teach one public chat provide
- tests prove parity and clarification behavior

## Test plan

Update and extend:

- `scripts/test-certified-builder.ts`
- `scripts/test-regressions.ts`
- `scripts/test-sdk-session.ts`

### Required assertions

- registry exposes only `chat_pi_pi`
- `chat_pi_pi` can complete a normal build request
- brownfield replacement request returns `clarification_needed` when unconfirmed
- unsupported TUI/bootstrap ask returns typed `unsupported`
- command projection and protocol invoke hit the same contract
- handoff UI behavior remains coherent and idempotent

## Validation commands

Use the smallest meaningful set:

```bash
npm run typecheck
npm run test:regressions
npm run test:certified-builder
npm run test:sdk-session
```

## Definition of done

This implementation is done when all of the following are true:

- `pi-pi` exposes exactly one public provide: `chat_pi_pi`
- `/chat-pi-pi` invokes that same public provide
- `build_certified_extension` is internal only
- clarification is typed output, not a protocol failure
- unsupported asks are typed output, not protocol failure
- runtime verification remains intact
- internal implementation is simpler or at least clearly more robust than before
- handoff UI shows a coherent lifecycle
- docs and tests consistently teach and verify the chat-first model
