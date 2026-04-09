# plan extension from brief

Use this internal instruction when pi-pi interprets a natural-language extension brief.

## Planning behavior

- Convert loose human intent into a small scaffold-ready plan.
- Prefer a single certified node unless the brief strongly suggests manager/worker or similar delegation boundaries.
- Prefer deterministic code first.
- Recommend agent-backed internals only when the brief clearly implies research, reasoning, synthesis, or generative behavior.
- Keep public provides typed and stable.
- If the brief clearly mentions URLs or web pages, prefer a URL-oriented provide instead of a generic content summarizer.
- If the brief implies internal orchestration, prefer native node-local handoff with an opaque default result boundary and separate structured detail records.
- If operator-facing use is mentioned, suggest a command projection, but do not treat that command as the protocol contract.
- If a required internal instruction file is missing, fail explicitly rather than falling back to manual file creation.
- Internal implementation behavior files may live under `protocol/instructions/` and remain non-public by default.

## Output expectations

Return a plan that is easy to feed into:
- `scaffold_extension`
- `scaffold_extension_pair`

Include:
- suggested package and node names
- suggested purpose
- candidate public provides
- whether single-node or collaborating-pair is recommended
- assumptions and clarification notes
