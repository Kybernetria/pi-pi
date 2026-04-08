# pi-pi TODO

Living checklist for finishing `pi-pi` according to the Pi Protocol spec.

## Current status

Already working:

- certified node bootstrap
- shared fabric registration
- standard `protocol` projection registration
- single-node scaffolding
- collaborating pair scaffolding
- AST-assisted validation
- natural-language brief planning provide
- deterministic cross-node delegation in generated scaffolds
- internal prompt/instruction resolution for planning and agent-backed worker scaffolds

Current gap:

- `pi-pi` still needs the last mile of **agent-awareness / orchestration polish** so the top-level chat experience can naturally discover and reuse protocol capabilities instead of feeling like a mostly non-agentic generator.

## P0 - finish the protocol-native agent-awareness loop

- [x] add or finalize a tiny shared prompt-awareness helper for the `protocol` tool
- [x] ensure the helper installs once per process and does not bloat context
- [x] make sure the helper is available through the certified bootstrap path
- [x] verify the `protocol` tool is discoverable in real Pi agent sessions
- [x] confirm the top-level chat experience can use protocol discovery before generating new code
- [x] keep the helper TypeScript-first and internal, not a public skill

## P1 - improve greenfield extension generation

- [x] make the natural-language planning provide produce better candidate provides from plain text
- [x] improve single-node vs collaborating-pair decisioning
- [x] infer more realistic input/output schemas from a brief
- [x] make generated handler stubs less generic when the prompt clearly implies a specific behavior
- [ ] preserve capability-first design while still being easy for a human to describe in normal chat

## P1 - improve existing repo migration support

- [x] add a proper migration-planning mode for existing repos
- [x] inspect existing commands/tools/prompts and map them to provides/projections
- [ ] improve AST-assisted detection for bootstrap and handler wiring
- [ ] add real rewrite/patch guidance instead of only validation and fresh scaffolds
- [x] add better reuse recommendations when an installed node already satisfies part of the brief

## P2 - strengthen validation and test coverage

- [ ] add failure-fixture tests for validator edge cases
- [x] extend validation to catch more semantic mismatches between manifest, handlers, and schemas
- [x] add a regression test for prompt-awareness registration
- [x] add a regression test for `protocol` projection registration
- [x] keep `npm run demo` and `npm run demo:pair-runtime` passing

## P2 - polish developer workflow

- [x] keep a short changelog note for any protocol-shape changes
- [x] keep README / guides synced with the actual generator behavior
- [ ] keep internal prompt files clearly separated from public skills
- [ ] keep prompt instructions compact and context-efficient

## Nice to have

- [ ] add richer operator-facing commands only when they add clear value
- [ ] add a dedicated plan command projection if natural-language planning feels useful in Pi UX
- [ ] add more examples that show reuse of existing certified nodes via protocol discovery

## Definition of done

`pi-pi` is finished when:

- normal chat can ask for a protocol-aligned extension in natural language
- the protocol-aware path can discover and reuse installed capabilities via the standard `protocol` projection
- greenfield scaffolds are strong enough to be useful without hand-holding
- existing repo migration is at least well-planned and partially automated
- the package stays strict, validated, installable, and protocol-certified
