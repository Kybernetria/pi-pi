# Contributing to `pi-pi`

`pi-pi` is the authoritative builder for modern pi-protocol compatible Pi packages/extensions.

## Canonical rules

- Public protocol surface is `pi_pi.build_package`.
- Use `protocolVersion: "0.2.0"` and canonical provide `execution` objects.
- Do not use legacy top-level `handler` / `agent` shorthand.
- Do not vendor protocol runtime code; use the unified `@kybernetria/pi-protocol` and Pi SDK adapters where needed.
- Do not use split packages (`@kyvernitria/pi-protocol-minimal`, `@kyvernitria/pi-protocol-pi-sdk`, `@kyvernitria/pi-protocol-pi-tool`).
- Use `@earendil-works/pi-coding-agent`, never the legacy `@mariozechner/pi-coding-agent` package.
- Keep Pi-specific code in `extension.ts`; keep package-building knowledge and validation under `protocol/`.
- Cross-node calls must go through the protocol fabric, not direct sibling package imports.
- For agent-backed provides, use `createPiSdkAgentExecutorsFromManifest()` when registering multiple agents from the manifest.
- Use `systemPrompt: { text, mode }` format for agent system prompts.
- For model hints, use `modelHint: { "specific": "provider/model-id" }` format.

## Validation

```bash
npm run typecheck
npm run test:pi-pi
```

## Important files

- `pi.protocol.json` — shipped protocol manifest.
- `extension.ts` — Pi extension registration and slash commands.
- `protocol/knowledge.ts` — embedded pi-protocol package rules.
- `protocol/agent-builder.ts` — builder agent system prompt and SDK adapter factory.
- `protocol/schemas.ts` — TypeScript types for build_package input/output.
- `protocol/validation.ts` — lightweight conformance checks.
- `scripts/test-pi-pi.ts` — deterministic tests using a fake SDK session.
