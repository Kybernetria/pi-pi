# pi-pi architecture

`pi-pi` is intentionally small and is intentionally a direct agent-backed protocol provide.

- `extension.ts` is the Pi adapter. It registers `pi_pi` with the shared protocol fabric and exposes slash-command projections.
- `pi.protocol.json` is the public protocol contract for `pi_pi.build_package`.
- `protocol/agent-builder.ts` creates the real Pi SDK AgentSession-backed protocol executor and owns the builder system prompt.
- `protocol/knowledge.ts` contains embedded pi-protocol package rules used by the builder prompt and validator guidance.
- `protocol/schemas.ts` contains the TypeScript input/output shape for `build_package`.
- `protocol/validation.ts` performs lightweight conformance checks for packages produced or repaired by pi-pi.

Runtime shape:

```text
fabric.invoke(pi_pi.build_package)
  -> protocol_builder ProtocolAgentExecutor
    -> one Pi SDK AgentSession
```

There is no handler wrapper around the builder agent, no delegated-session runtime, and no vendored protocol runtime. Cross-node use must go through the protocol fabric.

Generated packages may be handler-backed, agent-backed, or both. `protocol/handlers.ts` is only required for generated packages that declare handler-backed provides.
