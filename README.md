# pi-pi

`pi-pi` is the authoritative batteries-included builder for **protocol-certified** Pi Protocol extensions/packages.

It is itself a certified node and keeps the model capability-first:

- public contract is a small set of typed `provides`
- deterministic-first remains the default implementation policy
- low-level planning/scaffold/migration stages stay behind the node boundary
- node-local handoff is available natively for internal orchestration
- handoff now emits a compact host-visible indicator plus separate structured detail records for disclosure surfaces
- cross-node results stay compact and opaque by default
- builder output is validated for certification before success is returned

## Public protocol surface

`pi-pi` exposes only:

- `build_certified_extension`

Everything else is internal.

## Internal builder stages

These remain available only as internal implementation stages inside the node:

- `describe_certified_template`
- `validate_certified_extension`
- `plan_extension_from_brief`
- `plan_existing_repo_migration`
- `scaffold_extension`
- `scaffold_extension_pair`
- compatibility aliases
- low-level validation alias surface

The standard `protocol` projection hides those internals by default.

## Commands

Operator-facing projections stay small too:

- `/pi-pi-build-certified-extension`

## Builder behavior

`build_certified_extension`:

1. inspects the repo state
2. classifies greenfield vs brownfield
3. plans internally
4. scaffolds internally
5. validates the generated result before success
6. optionally applies the validated files to disk
7. returns a compact certified summary instead of low-level planning/scaffold details

Important rules:

- no plain non-certified output
- no public planning/scaffold clutter
- no manual non-certified fallback after a matching certified builder is discovered
- brownfield replacement requires `replaceExisting: true`
- pair mode is available only when explicitly allowed

## Runtime model

`pi-pi` follows the same protocol rules it generates:

- ships `pi.protocol.json`
- ensures the shared protocol fabric during activation
- ensures the batteries-included `protocol` projection on runtime startup
- registers with the shared protocol fabric on `session_start`
- unregisters on `session_shutdown`
- uses the fabric for recursive calls
- prefers `ctx.delegate.invoke()` for nested protocol work
- can use `ctx.handoff.run(...)` for node-local orchestration without leaking internal transcript across node boundaries by default
- handoff emits a `protocol-handoff` custom message so normal chat sessions can show the compact `handoff: <nodeId>.<provide>` indicator inline, with expanded details collapsed until disclosure opens them

## Reuse-or-stop caller rule

When a caller discovers a matching public builder provide like `pi-pi.build_certified_extension`, it should:

1. invoke that provide
2. use the validated result
3. stop and surface failure if the builder fails

It should **not** discover `pi-pi` and then improvise a non-certified local fallback.

## Example protocol flow

### 1. Discover the node

```json
{ "action": "registry" }
```

### 2. Inspect the builder

```json
{ "action": "describe_node", "nodeId": "pi-pi" }
```

### 3. Invoke the authoritative builder

If you are already working in the target repository, you can omit `repoDir` and let `pi-pi` use the current working directory.

Validation and template description are internal helper surfaces and are not part of the normal public discovery flow.

```json
{
  "action": "invoke",
  "request": {
    "provide": "build_certified_extension",
    "target": { "nodeId": "pi-pi" },
    "input": {
      "description": "Build me a certified extension that summarizes markdown notes and offers a local command.",
      "repoDir": "./packages/pi-notes",
      "applyChanges": true
    },
    "handoff": {
      "opaque": true
    }
  }
}
```

### 4. Validation happens internally

`build_certified_extension` validates the result before success, so manual validation is an internal implementation detail rather than a normal public step.

## Local development

```bash
npm install
npm run typecheck
npm run test:planning
npm run test:routing-policy
npm run test:validator-fixtures
npm run test:regressions
npm run test:sdk-session
npm run test:handoff
npm run test:certified-builder
npm run demo
```

## Demo expectations

The demo proves that:

1. `pi-pi` registers into the shared fabric
2. the `protocol` tool is installed automatically
3. the public builder surface is small
4. a fresh repo can be built through `build_certified_extension`
5. the resulting package is validated internally before the build succeeds
6. internal planning/scaffold stages stay hidden from public discovery

## Notes for generated-package authoring

The generated package model remains:

- TypeScript-first
- capability-first
- schema-backed
- standalone-installable
- protocol-certified by validation, not by naming alone

For the current checklist and remaining follow-up items, see `TODO.md`.
