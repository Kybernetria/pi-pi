# Contributing to `pi-pi`

`pi-pi` is the authoritative builder for modern pi-protocol compatible Pi packages/extensions.

## Canonical rules

- Public protocol surface is `pi_pi.build_package` plus optional chat alias `pi_pi.chat`.
- Use `protocolVersion: "0.2.0"` and canonical provide `execution` objects.
- Do not use legacy top-level `handler` / `agent` shorthand.
- Do not vendor protocol runtime code; use `@kyvernitria/pi-protocol-minimal` and Pi SDK adapters where needed.
- Use `@earendil-works/pi-coding-agent`, never the legacy `@mariozechner/pi-coding-agent` package.
- Keep Pi-specific code in `extension.ts`; keep package-building knowledge and validation under `protocol/`.
- Cross-node calls must go through the protocol fabric, not direct sibling package imports.

## Validation

```bash
npm run typecheck
npm run test:pi-pi
```

## Important files

- `pi.protocol.json` — shipped protocol manifest.
- `extension.ts` — Pi extension registration and slash commands.
- `protocol/knowledge.ts` — embedded pi-protocol package rules.
- `protocol/builder.ts` — explain/new/adapt/repair implementation.
- `protocol/validation.ts` — lightweight conformance checks.
