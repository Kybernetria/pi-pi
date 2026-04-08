# plan certified node from description

Use this internal instruction when pi-pi interprets a natural-language extension brief.

## Planning behavior

- Convert loose human intent into a small scaffold-ready plan.
- Prefer a single certified node unless the brief strongly suggests manager/worker or similar delegation boundaries.
- Prefer deterministic code first.
- Recommend agent-backed internals only when the brief clearly implies research, reasoning, synthesis, or generative behavior.
- Keep public provides typed and stable.
- If operator-facing use is mentioned, suggest a command projection, but do not treat that command as the protocol contract.
- Internal implementation behavior files may live under `protocol/instructions/` and remain non-public by default.

## Output expectations

Return a plan that is easy to feed into:
- `scaffold_certified_node`
- `scaffold_collaborating_nodes`

Include:
- suggested package and node names
- suggested purpose
- candidate public provides
- whether single-node or collaborating-pair is recommended
- assumptions and clarification notes
