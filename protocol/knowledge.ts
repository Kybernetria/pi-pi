export const REQUIRED_FILES = ["package.json", "pi.protocol.json", "extension.ts", "README.md"] as const;

export const PROTOCOL_KNOWLEDGE = `
Modern pi-protocol package contract:
- Ship a root pi.protocol.json manifest using protocolVersion "0.2.0".
- Register from a Pi extension with ensureProtocolFabric() and registerProtocolManifest().
- package.json for Pi extension packages must include pi.extensions with "./extension.ts".
- Keep Pi-specific code in the extension/adapter layer; protocol handlers should stay mostly generic.
- Call fabric.unregister(nodeId) before registerProtocolManifest() so reloads are safe.
- Every provide must include name, description, inputSchema, outputSchema, and canonical execution.
- Handler-backed execution is { "type": "handler", "handler": "handler_name" } and requires createHandlers() to return that key.
- Agent-backed execution is { "type": "agent", "agent": "agent_name" } and requires manifest.agents[agent_name].
- Agent-backed provides may set manifest.agents[agent_name].modelHint.specific to a concrete Pi model, preferably "provider/model-id"; if omitted, the agent uses normal Pi model selection/defaults.
- modelHint.thinkingLevel may set the Pi thinking level for that agent; modelHint.tier is advisory metadata only.
- Legacy top-level provide.handler or provide.agent shorthand is invalid.
- Do not vendor/duplicate protocol runtime code; use @kybernetria/pi-protocol and, for Pi SDK agent executors, @kybernetria/pi-protocol/sdk.
- Do not use unpublished package versions like "latest" for @kybernetria/pi-protocol-* unless they are actually published.
- For temporary local smoke tests only, file dependencies may point at local working trees, e.g. @kybernetria/pi-protocol as file:/var/home/kybernetria/Applications/pi/pi-protocol/packages/pi-protocol-minimal and @kybernetria/pi-protocol/sdk as file:/var/home/kybernetria/Applications/pi/pi-protocol/packages/pi-protocol-pi-sdk.
- Never put machine-specific absolute file: dependencies in production/publishable packages. For production packages, use published semver dependencies, workspace/file-relative dependencies appropriate to the repo, or document the dependency expectation instead of hardcoding a local absolute path.
- Import Pi extension types from @earendil-works/pi-coding-agent, never @mariozechner/pi-coding-agent.
- The protocol fabric is the source of truth. The Pi protocol tool is a compact projection of registry/describe/invoke; do not create one Pi tool per provide.
- Full manifest info remains internal, while agent-facing protocol tool descriptions stay compact and useful.
- Slash commands are local Pi projections that invoke the fabric; they are not the public cross-package contract.
- Direct sibling protocol package imports are forbidden. Discover and invoke other nodes through the fabric.
- Tests should verify manifest registration, describe/invoke behavior, validator behavior, and typecheck.
- Agent-backed packages do not need protocol/handlers.ts unless they also declare handler-backed provides.
`;

export function explainRequiredFiles(): string {
  return [
    "A modern pi-protocol Pi package normally needs:",
    "1. package.json — Pi package metadata, extension entry, and protocol dependencies.",
    "2. pi.protocol.json — protocolVersion 0.2.0 manifest with nodeId, purpose, provides, schemas, and canonical execution.",
    "3. extension.ts — Pi adapter that ensures the shared fabric, unregisters the node for reloads, registers the manifest, and optionally registers slash commands.",
    "4. README.md — usage through protocol invoke and any slash command projection.",
    "Optional: protocol/handlers.ts for handler-backed provides, protocol/knowledge.ts, schemas, validation, or Pi SDK agent executor adapters for agent-backed provides.",
  ].join("\n");
}

export function modernContractChecklist(): string[] {
  return [
    "protocolVersion is 0.2.0",
    "nodeId is stable and non-empty, preferably snake_case",
    "all provides use canonical execution",
    "extension calls ensureProtocolFabric()",
    "extension calls fabric.unregister(nodeId) before registration",
    "extension calls registerProtocolManifest()",
    "handler executions have matching createHandlers keys",
    "imports use @earendil-works/pi-coding-agent",
    "runtime comes from @kybernetria/pi-protocol / pi-sdk, not vendored code",
    "cross-node calls use fabric.invoke(), not direct sibling imports",
  ];
}
