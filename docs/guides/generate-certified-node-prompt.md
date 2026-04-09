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
- whether it should summarize URLs/web pages, in which case say that plainly
- whether internal orchestration should use native node-local handoff with a compact visible indicator and separate structured detail records
- whether the current workspace is the target repoDir, so the builder can be invoked directly without hunting for schema paths

## Example brief

> Build me a certified extension that summarizes markdown notes in the workspace and also gives me a local command.

## Example pair brief

> Build me a manager/worker protocol pair where the manager delegates research tasks to a worker. Keep the public contract typed and keep any internal instructions non-public.

## Important note

The public contract is still typed protocol provides.

If internal orchestration is needed, keep the compact result boundary separate from expanded handoff details and keep `opaque` as the default boundary when appropriate.

For `build_certified_extension`, `repoDir` can be omitted when the current working directory is the target repository.

Current public builder surface:

- `build_certified_extension`

Validation and template description are internal helper surfaces and are not part of normal public discovery.

Reuse-or-stop rule:

- if a matching certified builder provide is available, invoke it
- if it fails, surface that failure compactly
- do not switch to an improvised non-certified fallback after discovery

Commands, tools, internal instruction files, and disclosure behavior are projections or internals, not the protocol itself.
