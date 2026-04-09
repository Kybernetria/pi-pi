# Generate a certified node with `pi-pi`

Use `pi-pi.chat_pi_pi` with a plain-language message.

## Include only what matters

Mention, when relevant:

- what capability the package should expose
- whether operators need a local command projection
- whether the target is the current repo or a specific `repoDir`
- whether replacing existing repo contents is acceptable

`pi-pi` decides the internal build shape itself. Pair selection is not public protocol surface.

## Minimal example

> Build me a certified extension that summarizes markdown notes and offers a local command.

## Unsupported example

> Create an extension that changes Pi's live TUI loading flow before startup.

That should return a normal typed `unsupported` outcome rather than a protocol error.

## Canonical references

- public surface and outcomes: `README.md`
- contributor rules and validation commands: `CONTRIBUTING.md`
- architecture and module boundaries: `docs/ARCHITECTURE.md`

Use the public chat contract directly; do not invent fallback local scaffolding after discovery.
