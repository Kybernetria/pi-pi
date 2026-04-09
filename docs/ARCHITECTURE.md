# `pi-pi` architecture

## Kernel

- `pi.protocol.json` is the canonical manifest.
- Public `provides` are the only inter-package contract.
- Registry / discovery / invoke come from the vendored SDK.
- Provenance, trace, failure, handoff semantics, and delegated-conversation state live in the SDK/runtime layer.
- Prompt-awareness nudges, protocol-aware renderers, and delegated-turn routing live in the host projection layer.

## Public surface

- `chat_pi_pi` is the only public provide.
- Everything else in `pi-pi` is local implementation code.

## Module map

- `extensions/index.ts` — bootstrap entrypoint
- `extensions/runtime.ts` — session lifecycle and node registration
- `extensions/projection.ts` — protocol tool projection, protocol-aware renderers, delegated-conversation routing, prompt-awareness host wiring, and `/chat-pi-pi` command projection
- `protocol/chat.ts` — public chat-first contract orchestration and explicit continuation semantics
- `protocol/chat-orchestrator.ts` — prompt construction, tool-backed orchestration, and model/session shaping
- `protocol/chat-conversation-store.ts` — runtime-scoped delegated conversation token/session persistence
- `protocol/build.ts` — internal certified build orchestration and runtime verification
- `protocol/planning.ts` — brief parsing and migration planning
- `protocol/planner-policy.ts` — planning policy, brief interpretation helpers, and brownfield planning heuristics
- `protocol/provide-blueprints.ts` — inferred provide blueprint registry, schema inference, and starter handler blueprints
- `protocol/scaffolding.ts` — certified package scaffolding
- `protocol/template-renderer.ts` — generated file renderers and scaffold template emitters
- `protocol/validation.ts` — source validation and compatibility checks
- `protocol/builder-heuristics.ts` — compatibility re-export shim for extracted planner/template helpers
- `protocol/builder-support.ts` — repo/runtime smoke support
- `protocol/core.ts` — documentation-style exports and local re-exports
- `protocol/source-analysis.ts` — AST/bootstrap analysis
- `protocol/runtime-smoke-runner.mjs` — isolated runtime smoke process
- `vendor/pi-protocol-sdk.ts` — shared SDK, runtime fabric, registry/invoke contracts, conversation state, trace/handoff semantics, and thin child-session helpers

## Rule of thumb

- Change the public contract in `README.md`, `pi.protocol.json`, `protocol/chat.ts`, and the chat schemas.
- Change generated package shape in `protocol/scaffolding.ts`, `protocol/build.ts`, or `vendor/pi-protocol-sdk.ts`.
- Change runtime verification in `protocol/build.ts`, `protocol/builder-support.ts`, or `protocol/runtime-smoke-runner.mjs`.
- Change validation in `protocol/validation.ts` and `protocol/source-analysis.ts`.
