# Contributing to `pi-pi`

## Canonical rules

- Public `provides` are the only inter-package contract.
- `pi-pi` exposes one public provide: `chat_pi_pi`.
- Slash command and protocol invoke must hit the same public contract.
- Clarification and unsupported asks are normal typed outcomes, not protocol failures.
- Conversational provides must use explicit continuation states (`awaiting_user`, `awaiting_caller`, `closed`) rather than ambiguous booleans.
- `conversationToken` + `continuation.owner` are the public delegated-conversation contract for `chat_pi_pi`.
- Internal planning, scaffolding, build, validation, and prompt helpers are local code.
- Generated packages vendor `vendor/pi-protocol-sdk.ts`.
- `source_validated` and `runtime_verified` must stay distinct inside nested build results.
- Do not expand the public protocol surface for internal builder stages.

## File map

- `README.md` — public overview
- `TODO.md` — status checklist
- `docs/ARCHITECTURE.md` — module boundaries
- `pi.protocol.json` — canonical public manifest
- `extensions/index.ts` — extension bootstrap
- `extensions/runtime.ts` — session lifecycle and protocol-node registration
- `extensions/projection.ts` — protocol tool projection, protocol-aware renderers, delegated-conversation routing, prompt-awareness host wiring, and command projection
- `protocol/chat.ts` — public chat-first handler and continuation semantics
- `protocol/chat-orchestrator.ts` — prompt construction, tool-backed orchestration, and model/session shaping
- `protocol/chat-conversation-store.ts` — runtime-scoped delegated conversation token/session persistence
- `protocol/build.ts` — internal certified build orchestration and runtime verification
- `protocol/planning.ts` — brief parsing and migration planning
- `protocol/planner-policy.ts` — planning policy, brief interpretation helpers, and brownfield planning heuristics
- `protocol/provide-blueprints.ts` — inferred provide blueprint registry, schema inference, and starter handler blueprints
- `protocol/scaffolding.ts` — package scaffolding and generated-file assembly
- `protocol/template-renderer.ts` — generated file renderers and scaffold template emitters
- `protocol/validation.ts` — source validation and compatibility checks
- `protocol/builder-heuristics.ts` — compatibility re-export shim for extracted planner/template helpers
- `protocol/builder-support.ts` — repo/runtime smoke support
- `protocol/source-analysis.ts` — AST and bootstrap analysis
- `protocol/runtime-smoke-runner.mjs` — isolated runtime smoke process
- `vendor/pi-protocol-sdk.ts` — vendored SDK source of truth for registry/invoke contracts, trace/handoff semantics, conversation state, and thin child-session helpers

## Validation

```bash
npm run typecheck
npm run test:planning
npm run test:regressions
npm run test:certified-builder
npm run test:sdk-session
```

## Editing rule

If you finish a TODO item, check it off in `TODO.md` in place.
