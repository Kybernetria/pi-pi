# pi-pi

`pi-pi` is a TypeScript-first Pi Protocol package creator that is also a Pi Protocol certified node.

It follows the protocol itself:

- ships `pi.protocol.json`
- ensures the shared protocol fabric during activation
- ensures the batteries-included standard `protocol` projection during activation
- registers with the shared protocol fabric on `session_start`
- exposes canonical protocol `provides`
- offers Pi commands as projections of those same provides
- avoids direct imports of sibling certified nodes
- typechecks with `tsc --noEmit`
- remains standalone-installable by vendoring the prototype SDK/fabric shim in `vendor/pi-protocol-sdk.ts`

## Provides

- `describe_certified_template`
- `scaffold_certified_node`
- `scaffold_collaborating_nodes`
- `validate_certified_node`

## Pi commands

- `/pi-pi-template`
- `/pi-pi-new`
- `/pi-pi-new-pair`
- `/pi-pi-validate`

Important separation:

- `scaffold_certified_node` is a pure generation provide. It returns a file plan and file contents.
- `scaffold_collaborating_nodes` is a pure generation provide. It returns two package plans and grouped file contents.
- `/pi-pi-new` and `/pi-pi-new-pair` are operator-facing projections. If you pass `destinationDir`, they write generated files to disk.

## Collaborating nodes

`scaffold_collaborating_nodes` generates two separate certified packages:

- a manager node with a provide that delegates to a worker through `ctx.delegate.invoke()`
- a worker node with either:
  - deterministic implementation mode, or
  - agent-backed-ready internal implementation mode

The protocol surface remains capability-first in both cases.

Important caveat:

- the current agent-backed worker mode is a starter scaffold pattern
- it is not yet a fully realized embedded Pi agent runtime
- internal prompts remain non-public by default and are not generated as public skills

If agent-backed worker mode is selected, internal prompt files are generated under a non-discoverable location such as:

- `protocol/prompts/`

They are intentionally **not** generated as public Pi skills.

## Internal generation guidance

`pi-pi` may use internal non-discoverable instruction text for interpreting natural-language extension briefs.

Current internal instruction location:

- `protocol/instructions/interpret-extension-brief.md`

This is internal guidance for planning and generation behavior.
It is not intended to be exposed as a public skill by default.

Reference/example prompt guidance for humans lives at:

- `docs/guides/generate-certified-node-prompt.md`

That guide is only an example/reference. Users should not need to learn rigid prompt syntax just to describe an extension.

## Validation status

`validate_certified_node` is currently an **AST-assisted, source-based validator**.

It checks things like:

- required files
- manifest structure
- handler coverage
- schema presence
- AST-checked bootstrap structure
- forbidden direct certified-node imports
- non-standalone dependency specs such as `file:`, `link:`, and `workspace:`

It does **not** yet do full semantic validation.

## Runtime model notes

- certified package bootstrap should ensure both `ensureProtocolFabric(...)` and `ensureProtocolAgentProjection(...)`
- the standard `protocol` tool is a projection over the protocol, not the protocol itself
- `ctx.delegate` is the preferred bound recursive delegation surface because trace, caller, budget, and depth context stay attached automatically
- direct `ctx.fabric.invoke(...)` can still exist in low-level code, but generated collaborating scaffolds now prefer `ctx.delegate.invoke(...)`

## Dependency strategy

### This repository

`pi-pi` vendors the current prototype SDK/fabric implementation in:

- `vendor/pi-protocol-sdk.ts`

This keeps `pi-pi` standalone-installable while still following the shared fabric model prototyped in `pi-protocol`.

### Generated packages

Scaffolded packages default to:

- `@kyvernitria/pi-protocol-sdk@^0.1.0`

You can override that with `sdkDependency` in scaffold input if you want a different published range or a local development dependency strategy.

## Local development

```bash
npm install
npm run typecheck
npm run demo
```

The demo verifies that:

1. `pi-pi` loads and registers in the fabric
2. `pi-pi` ensures the standard `protocol` projection
3. `pi-pi` validates itself successfully
4. `pi-pi` can describe the certified template
5. `pi-pi` can scaffold a TypeScript certified-node template
6. generated bootstrap includes `ensureProtocolAgentProjection(...)`
7. `pi-pi` can scaffold a collaborating manager/worker pair
8. generated packages validate successfully
9. generated manager handlers call workers through `ctx.delegate.invoke()`
10. command projections remain aligned with the protocol handlers

For an end-to-end generated-pair runtime proof, also run:

```bash
npm run demo:pair-runtime
```

## Install into Pi

Project-local install:

```bash
pi install -l /var/home/kyvernitria/Applications/pi/pi-pi
```

Then start Pi in the target project and reload if needed:

```text
/reload
```

## Example single-node scaffold input

```json
{
  "packageName": "pi-hello",
  "nodeId": "pi-hello",
  "purpose": "Greets users through a certified protocol package.",
  "provides": [
    {
      "name": "say_hello",
      "description": "Return a starter greeting response."
    }
  ],
  "sdkDependency": "^0.1.0",
  "useInlineSchemas": false,
  "generateDebugCommands": true,
  "strictTypes": true
}
```

## Example collaborating-pair scaffold input

```json
{
  "managerPackageName": "pi-manager",
  "managerNodeId": "pi-manager",
  "workerPackageName": "pi-worker",
  "workerNodeId": "pi-worker",
  "managerProvideName": "delegate_task",
  "workerProvideName": "do_task",
  "workerMode": "agent-backed",
  "generateInternalPromptFiles": true,
  "generateDebugCommands": true,
  "sdkDependency": "^0.1.0",
  "strictTypes": true
}
```

## In Pi

Try:

- `/pi-pi-template`
- `/pi-pi-new { ...json input... }`
- `/pi-pi-new-pair { ...json input... }`
- `/pi-pi-validate ./some-generated-package`

For `/pi-pi-new-pair`, you can also pass:

```json
{
  "destinationDir": "./tmp/collaborating-pair",
  "input": {
    "managerPackageName": "pi-manager",
    "managerNodeId": "pi-manager",
    "workerPackageName": "pi-worker",
    "workerNodeId": "pi-worker",
    "managerProvideName": "delegate_task",
    "workerProvideName": "do_task",
    "workerMode": "deterministic"
  }
}
```

That writes:

- `./tmp/collaborating-pair/pi-manager/...`
- `./tmp/collaborating-pair/pi-worker/...`
