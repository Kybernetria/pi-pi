export const REQUIRED_FILES = ["package.json", "pi.protocol.json", "extension.ts", "README.md"] as const;

export const PROTOCOL_KNOWLEDGE = `
## Modern pi-protocol package contract (protocolVersion 0.2.0)

### Manifest & registration
- Ship a root pi.protocol.json manifest using \`protocolVersion "0.2.0"\`.
- Register from a Pi extension with \`ensureProtocolFabric()\` and \`registerProtocolManifest()\`.
- \`package.json\` for Pi extension packages must include \`pi.extensions\` with \`"./extension.ts"\`.
- Keep Pi-specific code in the extension/adapter layer; protocol handlers should stay mostly generic.
- Call \`fabric.unregister(nodeId)\` before \`registerProtocolManifest()\` so reloads are safe.

### Provide execution
- Every provide must include \`name\`, \`description\`, \`inputSchema\`, \`outputSchema\`, and canonical \`execution\`.
- Handler-backed execution: \`{ "type": "handler", "handler": "handler_name" }\` and requires \`createHandlers()\` to return that key.
- Agent-backed execution: \`{ "type": "agent", "agent": "agent_name" }\` and requires \`manifest.agents[agent_name]\`.
- Legacy top-level \`provide.handler\` or \`provide.agent\` shorthand is invalid.

### Agent-backed provides
- Declare each agent under \`manifest.agents\` with at minimum \`description\` and \`systemPrompt\`.
- \`systemPrompt\` supports \`{ text: string, mode: "append" | "replace" }\`. The default mode is \`"append"\`.
- Use \`createPiSdkAgentExecutorsFromManifest()\` from \`@kybernetria/pi-protocol/sdk/agent-session\` when registering multiple agents from the manifest automatically.
- For custom single-agent executors, use \`createDefaultPiSdkAgentExecutor()\` from \`@kybernetria/pi-protocol/sdk/agent-session\`.
- Agents may specify \`modelHint\`:
  \`\`\`json
  { "specific": "provider/model-id", "thinkingLevel": "high" }
  \`\`\`
- \`modelHint.specific\` should use \`"provider/model-id"\` format (e.g. \`"opencode-go/deepseek-v4-flash"\`).
- Absent \`modelHint\` means normal Pi model selection/defaults apply.
- \`modelHint.tier\` is advisory only and does not affect model selection.
- \`modelHint.thinkingLevel\` may be \`"none"\`, \`"low"\`, \`"medium"\`, or \`"high"\`.

### Handler-backed provides
- Create \`protocol/handlers.ts\` only when the package declares handler-backed provides.
- Handlers should validate and normalize inputs defensively before processing.
- Handlers should return schema-compatible outputs matching \`outputSchema\`.
- Export handler keys from \`createHandlers()\` that match \`execution.handler\` values.

### Cross-node invocation
- Discover and invoke other nodes through the shared protocol fabric, not direct sibling package imports.
- Use \`fabric.invoke()\` or \`fabric.describeNode()\` / \`fabric.describeProvide()\` for cross-node interactions.
- When orchestrating multi-node workflows, propagate \`traceId\` and \`session\` fields.
- Use \`callerNodeId\` in \`"nodeId.provideName"\` form when possible for provenance.
- Direct sibling imports of other protocol packages (\`pi-*\`, \`@*/pi-*\`) are forbidden.

### Dependencies & imports
- Do not vendor or duplicate protocol runtime code; use \`@kybernetria/pi-protocol\`.
- For Pi SDK agent executors, use \`@kybernetria/pi-protocol/sdk\` or \`@kybernetria/pi-protocol/sdk/agent-session\`.
- The \`@kybernetria/pi-protocol\` package is a unified package (no longer split into \`pi-protocol-minimal\`, \`pi-protocol-pi-sdk\`, \`pi-protocol-pi-tool\`).
- Do not use unpublished package versions like \`"latest"\` for \`@kybernetria/pi-protocol-*\`.
- Import Pi extension types from \`@earendil-works/pi-coding-agent\`, never \`@mariozechner/pi-coding-agent\`.
- Production packages must not contain machine-specific absolute \`file:\` dependencies.
- Temporary local smoke tests may use \`file:\` dependencies only when clearly marked as such (e.g. a comment or a \`local-dev\` entry).
- For production packages, use published semver dependencies, workspace/file-relative dependencies appropriate to the repo, or document the dependency expectation.

### Tool & fabric contract
- The protocol fabric is the source of truth. The Pi protocol tool is a compact projection of \`registry\`/\`describe\`/\`invoke\`; do not create one Pi tool per provide.
- Full manifest info remains internal, while agent-facing protocol tool descriptions stay compact and useful.
- Slash commands are local Pi projections that invoke the fabric; they are not the public cross-package contract.

### Testing & quality
- Tests should verify: manifest registration, describe behavior, invoke behavior (valid and invalid inputs), validator behavior, and typecheck.
- README should document protocol invoke examples with JSON snippets and the slash command if available.
- Agent-backed packages do not need \`protocol/handlers.ts\` unless they also declare handler-backed provides.
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
    "all provides use canonical execution (execution.type + execution.handler or execution.agent)",
    "extension calls ensureProtocolFabric()",
    "extension calls fabric.unregister(nodeId) before registration",
    "extension calls registerProtocolManifest()",
    "handler executions have matching createHandlers keys in protocol/handlers.ts",
    "agent-backed provides have manifest.agents[agentName] declared",
    "imports use @earendil-works/pi-coding-agent (never @mariozechner/pi-coding-agent)",
    "runtime comes from @kybernetria/pi-protocol (unified package), not vendored code or split packages",
    "cross-node calls use fabric.invoke(), not direct sibling imports",
    "modelHint.specific uses provider/model-id format when set",
    "systemPrompt has { text, mode } format when set",
    "no absolute file: dependencies in production packages",
    "README documents protocol invoke examples",
    "tests cover registration, describe, invoke, invalid inputs, and typecheck",
  ];
}
