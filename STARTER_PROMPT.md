# Starter prompt for a new session

Use this in a fresh session when working on Pi Protocol / `pi-pi` builder cleanup.

---

You are working in the Pi Protocol / `pi-pi` codebase.

Goal:
Fix the protocol-certified builder workflow so that `pi-pi` behaves like the authoritative batteries-included builder for protocol-certified extensions/packages.

Non-negotiable requirements:
- Keep the protocol capability-first.
- Keep deterministic-first as the default implementation policy.
- Integrate node-local subagent handoff natively into the protocol/runtime.
- Make opaque handoff the default cross-node mental model/result boundary.
- Emit a compact visible handoff indicator plus separate structured detail records so host disclosure UIs can collapse by default and expand on demand.
- Ensure `pi-pi` exposes only a small public builder surface.
- Move planning/scaffold/migration/pair/alias internals behind internal provides or internal implementation.
- Ensure outputs produced by `pi-pi` are protocol-certified by default.
- Ensure the caller follows a strict reuse-or-stop policy and never improvises a non-certified fallback after discovering a matching builder provide.

Read first:
1. `TODO.md`
2. `pi-protocol/docs/spec/pi-protocol-delegation.md`
3. `pi-protocol/docs/spec/pi-protocol-runtime.md`
4. `pi-protocol/docs/spec/pi-protocol-patterns.md`
5. `pi-protocol/docs/spec/pi-protocol-compliance.md`
6. `pi-protocol/docs/guides/authoring-certified-node.md`
7. `pi-protocol/docs/guides/generate-certified-node-prompt.md`
8. `pi-pi/README.md`
9. `pi-pi/protocol/core.ts`
10. `pi-pi/pi.protocol.json`
11. `pi-protocol/packages/pi-protocol-sdk/index.ts`

Primary tasks:
1. simplify `pi-pi` public API down to a small authoritative builder surface
2. make low-level builder stages internal
3. add/finish native protocol subagent handoff support with opaque result boundaries and structured disclosure surfaces
4. enforce caller reuse-or-stop behavior
5. add end-to-end tests from fresh repo sessions
6. update spec/docs so the model is explicit and no longer ambiguous

Target public surface:
- `build_certified_extension`
- `validate_certified_extension`
- optional `describe_certified_template`

Everything else should be internal unless there is a strong reason otherwise.

Required end-state:
- a normal chat agent can discover `pi-pi`
- invoke one top-level builder provide
- receive a compact validated result
- avoid manual non-certified local fallback
- rely on the same behavior consistently across fresh repos and future certified packages

Important constraints:
- do not redesign the protocol into an always-agentic system
- do not expose internal planning/migration/scaffold details publicly unless strictly necessary
- do not produce plain non-certified outputs from `pi-pi`
- do not leave the model split between notes and code; move stable conclusions into canonical spec/guides

Output expectations for this session:
- make direct file changes
- keep the design simple and robust
- add/update tests
- end with a concise summary of:
  - files changed
  - what was simplified
  - what was made internal/public
  - how the new handoff behavior works, including the compact indicator and expanded structured details
  - how to test it
