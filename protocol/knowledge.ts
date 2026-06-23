export const REQUIRED_FILES = ["package.json", "pi.protocol.json", "extension.ts", "protocol/handlers.ts", "README.md"] as const;

export const PROTOCOL_KNOWLEDGE = `
Modern pi-protocol package contract:
- Ship a root pi.protocol.json manifest using protocolVersion "0.2.0".
- Register from a Pi extension with ensureProtocolFabric() and registerProtocolManifest().
- Keep Pi-specific code in the extension/adapter layer; protocol handlers should stay mostly generic.
- Call fabric.unregister(nodeId) before registerProtocolManifest() so reloads are safe.
- Every provide must include name, description, inputSchema, outputSchema, and canonical execution.
- Handler-backed execution is { "type": "handler", "handler": "handler_name" } and requires createHandlers() to return that key.
- Agent-backed execution is { "type": "agent", "agent": "agent_name" } and requires manifest.agents[agent_name].
- Legacy top-level provide.handler or provide.agent shorthand is invalid.
- Do not vendor/duplicate protocol runtime code; use @kyvernitria/pi-protocol-minimal and, for Pi SDK agent executors, @kyvernitria/pi-protocol-pi-sdk.
- Import Pi extension types from @earendil-works/pi-coding-agent, never @mariozechner/pi-coding-agent.
- The protocol fabric is the source of truth. The Pi protocol tool is a compact projection of registry/describe/invoke; do not create one Pi tool per provide.
- Full manifest info remains internal, while agent-facing protocol tool descriptions stay compact and useful.
- Slash commands are local Pi projections that invoke the fabric; they are not the public cross-package contract.
- Direct sibling protocol package imports are forbidden. Discover and invoke other nodes through the fabric.
- Tests should verify manifest registration, describe/invoke behavior, validator behavior, and typecheck.
`;

export function explainRequiredFiles(): string {
  return [
    "A modern pi-protocol Pi package normally needs:",
    "1. package.json — Pi package metadata, extension entry, and protocol dependencies.",
    "2. pi.protocol.json — protocolVersion 0.2.0 manifest with nodeId, purpose, provides, schemas, and canonical execution.",
    "3. extension.ts — Pi adapter that ensures the shared fabric, unregisters the node for reloads, registers the manifest, and optionally registers slash commands.",
    "4. protocol/handlers.ts — handler-backed provide implementations returned from createHandlers().",
    "5. README.md — usage through protocol invoke and any slash command projection.",
    "Optional: protocol/knowledge.ts, schemas, templates, validation, or Pi SDK agent executor adapters for agent-backed provides.",
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
    "runtime comes from @kyvernitria/pi-protocol-minimal / pi-sdk, not vendored code",
    "cross-node calls use fabric.invoke(), not direct sibling imports",
  ];
}
