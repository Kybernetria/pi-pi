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
- `validate_certified_extension`
- `describe_certified_template`

Everything else is internal.

## Internal builder stages

These remain available only as internal implementation stages inside the node:

- `plan_extension_from_brief`
- `plan_existing_repo_migration`
- `scaffold_extension`
- `scaffold_extension_pair`
- compatibility aliases
- low-level validation alias surface

The standard `protocol` projection hides those internals by default.

## Commands

Operator-facing projections stay small too:

- `/pi-pi-template`
- `/pi-pi-build-certified-extension`
- `/pi-pi-validate-certified-extension`

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
- host UIs can render the compact `handoff: <nodeId>.<provide>` indicator and keep expanded details collapsed until a disclosure action opens them

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

### 4. Validate explicitly if needed

```json
{
  "action": "invoke",
  "request": {
    "provide": "validate_certified_extension",
    "target": { "nodeId": "pi-pi" },
    "input": {
      "packageDir": "./packages/pi-notes"
    }
  }
}
```

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
5. the resulting package validates through `validate_certified_extension`
6. internal planning/scaffold stages stay hidden from public discovery

## Notes for generated-package authoring

The generated package model remains:

- TypeScript-first
- capability-first
- schema-backed
- standalone-installable
- protocol-certified by validation, not by naming alone

For the current checklist and remaining follow-up items, see `TODO.md`.
