# Describe extensions naturally with pi-pi

`pi-pi` now exposes a small authoritative public builder surface and keeps natural-language planning internal.

You do not need rigid prompt syntax.

## Good brief ingredients

When useful, mention:

- what the extension is for
- whether other nodes should call it
- whether a simple local command would help operators
- whether it should remain deterministic or use agent-backed internals
- whether it should be one node or a collaborating pair

## Example brief

> Build me a certified extension that summarizes markdown notes in the workspace and also gives me a local command.

## Example pair brief

> Build me a manager/worker protocol pair where the manager delegates research tasks to a worker. Keep the public contract typed and keep any internal instructions non-public.

## Important note

The public contract is still typed protocol provides.

Current public builder surface:

- `build_certified_extension`
- `validate_certified_extension`
- `describe_certified_template`

Reuse-or-stop rule:

- if a matching certified builder provide is available, invoke it
- if it fails, surface that failure compactly
- do not switch to an improvised non-certified fallback after discovery

Commands, tools, and internal instruction files are projections or internals, not the protocol itself.
