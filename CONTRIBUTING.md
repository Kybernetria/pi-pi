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

## Ownership guide

- `README.md` owns the public contract and quick-use examples.
- `docs/ARCHITECTURE.md` owns module boundaries and the detailed module map.
- `pi.protocol.json`, `protocol/chat.ts`, and `protocol/schemas/chat_pi_pi.*` are the canonical public runtime contract.
- `extensions/projection.ts`, `extensions/protocol-conversation.ts`, and `extensions/protocol-child-session.ts` own host-facing delegated-conversation UX, projection state, and child-session bridge policy.
- `vendor/pi-protocol-sdk.ts` stays focused on registry/discovery/invoke contracts, trace/handoff semantics, typed events, and protocol tool registration.

## Validation

```bash
npm run typecheck
npm run test:planning
npm run test:regressions
npm run test:certified-builder
npm run test:sdk-session
```

## Editing rule

When changing ownership boundaries, update `docs/ARCHITECTURE.md` in the same patch so the module map stays accurate.
