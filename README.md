# pi-pi

`pi-pi` is a protocol-invoked agent builder for Pi packages/extensions that conform to pi-protocol 0.2.0.

It registers protocol node `pi_pi` with one public provide:

- `build_package` — invoke the builder agent through the protocol fabric and have it build/adapt/repair the requested package in `targetDir`.

## What pi-pi is

`pi-pi` understands the pi-protocol framework and project shape. It does not carry forced behavior templates. The behavior comes from the user's request, and the builder agent writes the requested implementation in the specified directory.

`pi_pi.build_package` is intentionally a clean exemplar agent provide: the registered executor is the Pi SDK AgentSession adapter itself. Protocol provenance, runtime streaming, session control, and aborts flow through the normal fabric invocation path. The builder's full operational prompt lives in `protocol/agent-builder.ts`; the manifest prompt is descriptive so there is one authoritative implementation prompt.

Important: using `pi-pi` means invoking `pi_pi.build_package` through the protocol fabric/tool. Manually writing files from an outer coding session bypasses pi-pi and is not a valid test of this package.

## Shape

```text
fabric.invoke(pi_pi.build_package)
  -> protocol_builder ProtocolAgentExecutor
    -> one Pi SDK AgentSession
```

There is no handler-style wrapper that creates an inner SDK executor. Validation/repair helpers should be separate handler provides if added later.

## Protocol invocation

```json
{
  "nodeId": "pi_pi",
  "provide": "build_package",
  "input": {
    "request": "Build a pi-protocol package that exposes the behavior I describe here...",
    "targetDir": "/absolute/path/to/package"
  }
}
```

`targetDir` is required because `pi-pi` is a file-writing builder.

## Slash command

```text
/pi_pi.build /absolute/path/to/package build a pi-protocol package that ...
```

The slash command is only a local Pi convenience wrapper around `pi_pi.build_package`.

## Protocol contract the agent follows

Built packages should:

- use `protocolVersion: "0.2.0"`
- declare canonical provide execution: `{ "type": "handler", "handler": "..." }` or `{ "type": "agent", "agent": "..." }`
- avoid legacy top-level `handler` / `agent` shorthand
- register from `extension.ts` with `ensureProtocolFabric()` and `registerProtocolManifest()`
- call `fabric.unregister(nodeId)` before registration
- import Pi APIs from `@earendil-works/pi-coding-agent`
- use `@kyvernitria/pi-protocol-minimal` and, when needed, `@kyvernitria/pi-protocol-pi-sdk`
- keep Pi-specific APIs in the extension/adapter layer
- use protocol fabric calls for cross-node interactions
- only require `protocol/handlers.ts` when a generated package declares handler-backed provides

## Global install

This package can be made globally available to Pi from:

```text
/var/home/kyvernitria/.pi/agent/extensions/pi-pi
```

That path should point to this working tree:

```text
/var/home/kyvernitria/Applications/pi/pi-pi
```

## Development

```bash
npm install
npm run typecheck
npm run test:pi-pi
```
