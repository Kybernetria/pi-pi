# pi-pi architecture

`pi-pi` is intentionally small and is intentionally a direct agent-backed protocol provide.

## Runtime shape

```text
fabric.invoke(pi_pi.build_package)
  -> protocol_builder ProtocolAgentExecutor
    -> one Pi SDK AgentSession
```

There is no handler wrapper around the builder agent, no delegated-session runtime, and no vendored protocol runtime. Cross-node use must go through the protocol fabric.

## Files

- `extension.ts` is the Pi adapter. It registers `pi_pi` with the shared protocol fabric and exposes slash-command projections.
- `pi.protocol.json` is the public protocol contract for `pi_pi.build_package`. It declares the `protocol_builder` agent with `systemPrompt` and `modelHint`.
- `protocol/agent-builder.ts` creates the real Pi SDK AgentSession-backed protocol executor, owns the builder system prompt, and provides the `createPrompt`/`parseBuildPackageOutput` functions.
- `protocol/knowledge.ts` contains embedded pi-protocol package rules used by the builder prompt and validator guidance.
- `protocol/schemas.ts` contains the TypeScript input/output shape for `build_package`.
- `protocol/validation.ts` performs lightweight conformance checks for packages produced or repaired by pi-pi.

## Agent-backed provide pattern

pi-pi demonstrates the agent-backed provide pattern using `createDefaultPiSdkAgentExecutor()` from `@kybernetria/pi-protocol/sdk/agent-session`. For packages with multiple agents, use `createPiSdkAgentExecutorsFromManifest()` instead, which reads agent configuration directly from the manifest.

## Generated package patterns

Generated packages may be handler-backed, agent-backed, or both. `protocol/handlers.ts` is only required for generated packages that declare handler-backed provides. Agent-backed packages use `manifest.agents` and `createPiSdkAgentExecutorsFromManifest()`.

Key principles enforced:
- `protocolVersion: "0.2.0"` in manifests
- Canonical `execution` objects (never legacy top-level shorthand)
- `ensureProtocolFabric()` and `registerProtocolManifest()` in extensions
- `fabric.unregister(nodeId)` before registration for safe reloads
- Unified `@kybernetria/pi-protocol` package (not the old split packages)
- Cross-node calls through fabric, not direct imports
- No vendored protocol runtime
- No machine-specific absolute `file:` dependencies in production packages
