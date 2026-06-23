# pi-pi

`pi-pi` is a protocol package builder for modern pi-protocol compatible Pi packages/extensions.

It registers protocol node `pi_pi`:

- `build_package` — canonical public provide for build/adapt/repair/explain.
- `chat` — optional chat-style alias accepting `message` or `request`.

## Capability model and honesty rule

`pi-pi` is not a generic scaffold generator. It currently has deterministic, behavior-specific templates for known package families, including:

- markdown summarizer protocol packages
- project review agent packages
- explicitly simple handler-backed protocol packages

The handler is structured so an agent-backed builder can be plugged in through the Pi SDK AgentSession adapter. If no trusted agent executor is available and the deterministic builder cannot implement the requested behavior, `pi-pi` returns `unsupported` or `clarification_needed`; it does **not** claim `completed` for a generic placeholder.

## Protocol invocation

Through the global protocol tool/fabric, invoke `pi_pi.build_package`:

```json
{
  "nodeId": "pi_pi",
  "provide": "build_package",
  "input": {
    "request": "Build me a protocol package that exposes a handler provide for summarizing markdown files.",
    "mode": "new",
    "targetDir": "/absolute/path/to/my-package",
    "applyChanges": true
  }
}
```

`applyChanges: false` is plan-only and may return `plan`/`filePreviews`. `applyChanges: true` can write files and therefore requires `targetDir`.

Repair example:

```json
{
  "nodeId": "pi_pi",
  "provide": "build_package",
  "input": {
    "request": "Repair this package so it conforms to pi-protocol 0.2.0.",
    "mode": "repair",
    "targetDir": "/absolute/path/to/package",
    "applyChanges": false
  }
}
```

## Slash command

Slash commands remain safe and plan-only by default:

```text
/pi_pi.build explain the required files for a pi-protocol package
/pi_pi.chat repair this package so it conforms to pi-protocol 0.2.0
```

Use protocol invocation with `targetDir` and `applyChanges: true` for file-writing mode.

## Modern package contract

Generated or repaired packages should:

- ship `package.json`, `pi.protocol.json`, `extension.ts`, `protocol/handlers.ts`, and `README.md`
- use `protocolVersion: "0.2.0"`
- use canonical provide execution, e.g. `{ "type": "handler", "handler": "summarize_markdown" }`
- register from the extension with `ensureProtocolFabric()` and `registerProtocolManifest()`
- call `fabric.unregister(nodeId)` before registration for reload-friendliness
- import Pi types from `@earendil-works/pi-coding-agent`
- use `@kyvernitria/pi-protocol-minimal` and `@kyvernitria/pi-protocol-pi-sdk` rather than vendoring protocol runtime code
- use `fabric.invoke()` for cross-node calls instead of direct sibling imports

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
