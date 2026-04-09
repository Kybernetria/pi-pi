# `pi-pi` architecture

## Kernel

- `pi.protocol.json` is the canonical manifest.
- Public `provides` are the only inter-package contract.
- `chat_pi_pi` is the only public provide.
- `vendor/pi-protocol-sdk.ts` owns registry/discovery/invoke contracts, trace/handoff semantics, typed protocol events, and protocol tool registration.
- Host-owned delegated-conversation state, projection policy, and child-session bridge/runtime wiring live in `extensions/*`.
- Everything under `protocol/*` other than the public chat contract is local implementation code.

## Layered module map

### Host extension layer

- `extensions/index.ts` — bootstrap entrypoint
- `extensions/runtime.ts` — session lifecycle, fabric creation, and node registration
- `extensions/projection.ts` — protocol tool projection, protocol-aware renderers, delegated-turn routing, prompt-awareness wiring, and `/chat-pi-pi` command projection
- `extensions/protocol-conversation.ts` — host-owned delegated-conversation frame state, snapshotting, and visible conversation summary emission
- `extensions/protocol-child-session.ts` — child-session runtime policy, inherited-tool wiring, guardrails, and delegated stream/status bridge adapters

### Public protocol layer

- `protocol/chat.ts` — public chat-first handler and explicit continuation semantics
- `protocol/contracts.ts` — public input/output types
- `protocol/handlers.ts` — handler registration for the manifest surface
- `protocol/chat-orchestrator.ts` — prompt construction, tool-backed orchestration, and child-session usage for the public chat contract
- `protocol/chat-conversation-store.ts` — runtime-scoped delegated conversation token/session persistence

### Internal builder layer

- `protocol/build.ts` — internal certified build orchestration and runtime verification
- `protocol/planning.ts` — brief parsing and migration planning
- `protocol/planner-policy.ts` — planning policy, prompt shaping, and brownfield heuristics
- `protocol/provide-blueprints.ts` — inferred provide blueprints, schema inference, and starter handler blueprints
- `protocol/scaffolding.ts` — certified package scaffolding
- `protocol/template-renderer.ts` — generated file renderers and scaffold template emitters
- `protocol/validation.ts` — source validation and compatibility checks
- `protocol/builder-heuristics.ts` — compatibility re-export shim for extracted planner/template helpers
- `protocol/builder-support.ts` — repo/runtime smoke support
- `protocol/core.ts` — documentation-style exports and local re-exports
- `protocol/source-analysis.ts` — AST/bootstrap analysis
- `protocol/runtime-smoke-runner.mjs` — isolated runtime smoke process

## Rule of thumb

- Change the public contract in `README.md`, `pi.protocol.json`, `protocol/chat.ts`, and `protocol/schemas/chat_pi_pi.*`.
- Change host conversation UX or delegated-session bridge behavior in `extensions/projection.ts`, `extensions/protocol-conversation.ts`, or `extensions/protocol-child-session.ts`.
- Change builder behavior in `protocol/build.ts`, `protocol/planning.ts`, `protocol/scaffolding.ts`, or related internal builder helpers.
- Change runtime verification in `protocol/build.ts`, `protocol/builder-support.ts`, or `protocol/runtime-smoke-runner.mjs`.
- Change validation in `protocol/validation.ts` and `protocol/source-analysis.ts`.
