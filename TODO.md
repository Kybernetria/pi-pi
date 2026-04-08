# TODO — Simplify and harden Pi Protocol builder flow

## Goal

Make Pi Protocol and `pi-pi` behave like a robust, batteries-included, protocol-certified builder system:

- `pi-pi` remains a **protocol-certified package**
- subagent handoff becomes a **native protocol/runtime behavior**
- chat sees a **small, stable public builder surface**
- low-level planning/scaffold/migration stages become **internal**
- after proving the model with real packages/extensions, the behavior is **locked in** and ambiguity is removed from the spec/docs/runtime

---

## Decisions to lock in

- [x] Keep the protocol **capability-first**
  - `provides` remain the canonical contract
  - deterministic-first remains the default policy
  - subagent usage is an **internal implementation strategy**, not the public mental model

- [x] Make **subagent handoff native** to the protocol/runtime
  - embedded node-local subagent execution surface exists as `ctx.handoff.run(...)`
  - trace/budget/depth propagation is bound into the handoff context
  - opaque result boundary is the current default

- [x] Shrink `pi-pi` public surface
  - chat should not see planning/scaffold/migration aliases and substeps
  - expose only top-level builder/validator entrypoints publicly

- [x] Make batteries-included actually true
  - installed certified builder packages should work in fresh repos without protocol archaeology

---

## Phase 1 — Simplify `pi-pi` public API

### Public provides to keep
- [x] `build_certified_extension`
- [x] do **not** expose `build_certified_extension_pair` publicly unless a strong reason emerges later

### Internal helper surfaces to keep hidden
- [x] `validate_certified_extension`
- [x] `describe_certified_template`

### Low-level provides to move internal
- [x] `plan_extension_from_brief`
- [x] `plan_existing_repo_migration`
- [x] `scaffold_extension`
- [x] `scaffold_extension_pair`
- [x] brownfield/greenfield classification helpers remain internal implementation
- [x] compatibility aliases are internal only
- [x] low-level validator stage remains internal (`validate_extension`)

### `pi-pi` behavior target
- [x] top-level builder inspects repo state
- [x] internally classifies greenfield vs brownfield
- [x] plans internally
- [x] scaffolds internally
- [x] validates before returning success
- [x] returns compact structured result instead of exposing substeps as operator API

### Files likely involved
- [x] `pi-pi/pi.protocol.json`
- [x] `pi-pi/protocol/core.ts`
- [x] `pi-pi/protocol/handlers.ts`
- [x] `pi-pi/extensions/index.ts`

---

## Phase 2 — Native protocol subagent handoff

### Runtime/SDK work
- [x] define exact semantics for `handoff`
- [x] implement node-local embedded subagent execution surface in protocol SDK/runtime
- [x] bind subagent execution to:
  - [x] caller node id
  - [x] trace/span
  - [x] budget
  - [x] depth/maxDepth
  - [x] visibility rules
- [x] make `handoff.opaque: true` return only final structured result
- [x] prevent internal transcript leakage across node boundaries by default
- [x] ensure embedded subagent receives bound `ctx.delegate`

### Lock-in rule
- [x] if a provide internally uses a subagent, that remains a node-local implementation detail
- [x] the public contract remains the provide and its validated output

### Files likely involved
- [x] `pi-protocol/packages/pi-protocol-sdk/index.ts`
- [x] `pi-protocol/docs/spec/pi-protocol-delegation.md`
- [x] `pi-protocol/docs/spec/pi-protocol-runtime.md`
- [x] `pi-protocol/docs/spec/pi-protocol-patterns.md`

---

## Phase 3 — Strict caller policy: reuse-or-stop

### Caller/orchestration changes
- [x] if a matching public builder provide exists, use it
- [x] do not manually freestyle local implementation after successful builder discovery
- [x] if the available provide is insufficient, stop and surface that mismatch explicitly
- [x] after successful build invocation, caller should either:
  - [x] apply the returned certified result, or
  - [x] report compact completion/failure

### Lock-in rule
- [x] reuse-or-stop, never reuse-then-freestyle

---

## Phase 4 — Batteries-included verification

- [x] any certified package can ensure the shared fabric
- [x] any certified package can ensure the standard `protocol` projection
- [x] prompt-awareness helper is installed once per process
- [x] builder packages work from fresh repo sessions without hidden repo-local setup
- [x] normal chat does not need to understand planning/migration/scaffold internals

---

## Phase 5 — Certification hardening

- [x] all successful outputs produced by `pi-pi` are protocol-certified by default
- [x] prevent silent generation of plain non-certified local extensions/packages
- [ ] validator must confirm:
  - [ ] `pi.protocol.json`
  - [ ] `extensions/index.ts`
  - [ ] `protocol/handlers.ts`
  - [ ] per-provide schemas
  - [ ] bootstrap registration/unregistration
  - [ ] no forbidden sibling certified-node imports
  - [ ] correct public/internal visibility
  - [ ] cross-node calls go through protocol delegation/fabric
- [ ] hard-fail if output is not certifiable

---

## Phase 6 — Build real examples, then freeze the model

### Prove with real packages/extensions
- [ ] one simple deterministic certified extension/package
- [ ] one brownfield upgrade
- [ ] one package replacing an existing generated package
- [ ] one node using internal subagent-backed execution
- [ ] optionally one collaborating-pair package set

### Then lock in
- [ ] freeze the builder model
- [ ] remove overlapping public entrypoints
- [ ] demote legacy/alias surfaces to internal or compatibility-only
- [ ] document one canonical end-to-end workflow
- [ ] remove ambiguity from notes/spec/guides

---

## Spec and doc cleanup

### Canonical spec updates
- [x] `docs/spec/pi-protocol-delegation.md`
- [x] `docs/spec/pi-protocol-runtime.md`
- [x] `docs/spec/pi-protocol-patterns.md`
- [x] `docs/spec/pi-protocol-compliance.md`
- [ ] `docs/spec/pi-protocol-ecosystem.md`

### Guide cleanup
- [x] `docs/guides/authoring-certified-node.md`
- [x] `docs/guides/generate-certified-node-prompt.md`

### Move durable conclusions out of notes
- [ ] promote stable conclusions from note files into canonical spec/guides

### Document explicitly
- [x] public vs internal provides
- [x] native subagent handoff semantics
- [x] opaque result boundaries
- [x] deterministic-first with internal subagent escalation
- [x] builder-node expected behavior
- [x] reuse-or-stop caller rule

---

## Tests to add

### Runtime / SDK
- [x] `handoff.opaque: true` returns only final structured result
- [x] trace/budget/depth propagate through embedded subagent execution
- [x] internal provides are hidden from default public protocol projection
- [x] public/internal visibility works correctly

### `pi-pi`
- [x] fresh repo build succeeds end-to-end
- [x] existing certified package replacement succeeds
- [ ] brownfield upgrade succeeds
- [x] validator rejects non-certified outputs
- [x] foreign cwd still resolves node-local instruction files
- [x] caller receives compact result instead of internal reasoning transcript
- [x] pair mode works only when explicitly requested

### Host/caller behavior
- [x] if matching public builder exists, caller does not freestyle locally
- [x] if builder fails, caller surfaces failure instead of falling back to manual local implementation
- [x] normal chat can use `pi-pi` without needing low-level protocol knowledge

---

## Minimal target public contract

### `build_certified_extension` input
- [x] `description` / `brief`
- [x] `repoDir`
- [x] `replaceExisting?`
- [x] `applyChanges?`
- [x] `allowPair?`
- [ ] optional validation strictness / debug flags

### `build_certified_extension` output
- [x] package/node summary
- [x] changed/generated files
- [x] validation summary
- [x] assumptions
- [x] compact completion message
- [x] no internal planning/subagent transcript by default

---

## Non-negotiable robustness rules

- [ ] no plain non-certified output from `pi-pi`
- [ ] no public clutter of low-level builder internals
- [ ] no caller improvisation after successful builder discovery
- [ ] no subagent authority escalation
- [ ] no internal transcript leakage across node boundaries by default
- [ ] no ambiguity about whether builder output is certified

---

## Immediate next steps

- [x] add a **visible but compact handoff indicator** in the host/runtime when node-local handoff starts
  - default label: `handoff: <nodeId>.<provide>`
  - example: `handoff: pi-pi.build_certified_extension`
  - include simple running/done/failed state when available
- [x] make handoff UI **collapsed by default, expandable on demand**
  - keep the compact validated result boundary separate from the expanded handoff trace
  - use the disclosure payload shape so Pi can reuse its existing disclosure UX
- [x] expanded handoff should show **structured recorded handoff trace/events**, not raw hidden chain-of-thought as a protocol requirement
  - handoff lifecycle
  - detail events / emitted notes
  - nested protocol/tool calls when recorded
  - redacted by default when `opaque: true`
  - richer expansion allowed when `opaque: false`
- [ ] wire the host disclosure action to the new handoff detail surface (handled in Pi base layer, not in this repo)
- [ ] finish brownfield-upgrade behavior beyond full replacement mode
- [ ] update the ecosystem builder spec so the builder model is fully canonical

---

## Success criteria

- [x] a normal chat agent sees a small builder surface
- [x] it can invoke `pi-pi` once to build a certified extension/package
- [x] `pi-pi` may use deterministic code first and a subagent internally
- [x] the result comes back as a compact validated protocol result
- [x] no non-certified fallback is produced
- [ ] the behavior is specified clearly enough that future certified packages follow the same model without ambiguity

---

## Current status snapshot

Implemented so far:

- `pi-pi` public surface reduced to `build_certified_extension`; `validate_certified_extension` and `describe_certified_template` remain internal helper surfaces
- planning/scaffold/migration/alias stages moved behind internal visibility
- runtime/SDK gained native `ctx.handoff.run(...)` with bound trace/budget/depth/delegate context
- handoff now emits a compact visible indicator plus separate structured detail records for collapsed/expanded disclosure, with exported indicator/detail shapes for host reuse
- opaque handoff remains the default result boundary
- public protocol projection hides internal provides
- caller guidance now enforces reuse-or-stop
- end-to-end tests cover fresh sessions, handoff behavior, internal visibility, and certified builder flow
- builder behavior now treats user brief as authoritative in brownfield replacement mode instead of accidentally exposing migration-only scaffolds

Still worth doing next:

- host-visible collapsed handoff indicator UX is now data-shaped and ready for host reuse
- expanded structured handoff trace rendering from provenance entries is now available via `handoff_detail`
- host disclosure reuse is handled by Pi base-layer UI conventions rather than this repo
- final ecosystem-spec cleanup
- more nuanced brownfield upgrade flow beyond replace-and-certify
