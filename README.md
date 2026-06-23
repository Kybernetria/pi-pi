# pi-pi

`pi-pi` is the protocol package builder for modern pi-protocol compatible Pi packages/extensions.

It registers protocol node `pi_pi` and exposes:

- `build_package` — build, adapt, repair, or explain pi-protocol packages.
- `chat` — chat-style alias that accepts `message` or `request`.

## Protocol usage

```json
{
  "action": "invoke",
  "request": {
    "provide": "build_package",
    "target": { "nodeId": "pi_pi" },
    "input": {
      "request": "Explain the required files for a pi-protocol package",
      "mode": "explain"
    }
  }
}
```

To generate files, call with a target directory and explicit write permission:

```json
{
  "request": "Build me a protocol package that exposes a handler provide for summarizing markdown files.",
  "mode": "new",
  "targetDir": "/absolute/path/to/my-package",
  "applyChanges": true
}
```

Slash commands are plan-only by default:

```text
/pi_pi.build explain the required files for a pi-protocol package
/pi_pi.chat repair this package so it conforms to pi-protocol 0.2.0
```

## Modern package contract

Generated or repaired packages should:

- ship `package.json`, `pi.protocol.json`, `extension.ts`, `protocol/handlers.ts`, and `README.md`
- use `protocolVersion: "0.2.0"`
- use canonical provide execution, e.g. `{ "type": "handler", "handler": "run" }`
- register from the extension with `ensureProtocolFabric()` and `registerProtocolManifest()`
- call `fabric.unregister(nodeId)` before registration for reload-friendliness
- import Pi types from `@earendil-works/pi-coding-agent`
- use `@kyvernitria/pi-protocol-minimal` and `@kyvernitria/pi-protocol-pi-sdk` rather than vendoring protocol runtime code
- use `fabric.invoke()` for cross-node calls instead of direct sibling imports

## Development

```bash
npm install
npm run typecheck
npm run test:pi-pi
```
