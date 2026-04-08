# plan existing repo migration

Use this internal instruction when pi-pi inspects an existing repository for migration to Pi Protocol.

## Planning behavior

- Inspect the existing repository first.
- Map commands, scripts, docs, handlers, and bootstrap wiring to protocol provides/projections.
- Prefer reuse over replacement.
- Keep the plan deterministic and source-based.
- Be explicit about heuristic inferences versus guaranteed findings.
- If the repo clearly splits orchestration from worker behavior, recommend a collaborating pair; otherwise prefer one node.
- If the repo needs internal orchestration, prefer native node-local handoff with a compact indicator and separate structured detail records, while keeping the compact result boundary opaque by default.
- Do not expose internal instructions as public skills.

## Output expectations

Return a source-based migration plan that is easy to feed into:
- `scaffold_extension`
- `scaffold_extension_pair`

Include:
- current capabilities
- proposed protocol surface
- reuse opportunities
- recommended migration steps
- file-level patch guidance
