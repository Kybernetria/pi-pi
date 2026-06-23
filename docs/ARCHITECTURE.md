# pi-pi architecture

`pi-pi` is intentionally small:

- `extension.ts` is the Pi adapter. It registers `pi_pi` with the shared protocol fabric and exposes slash-command projections.
- `pi.protocol.json` is the public protocol contract.
- `protocol/handlers.ts` maps canonical handler names to implementation functions.
- `protocol/builder.ts` implements explain/new/adapt/repair behavior.
- `protocol/knowledge.ts` contains embedded pi-protocol package rules.
- `protocol/templates.ts` renders starter packages.
- `protocol/validation.ts` performs lightweight conformance checks.

There is no delegated-session runtime or vendored protocol runtime. Cross-node use must go through the protocol fabric.
