# pi-pi internal default planning instruction

This file is an internal behavior file for pi-pi planning paths.

It is not a public skill.
It is not automatically injected into general chat context.
It should only guide internal planning/runtime behavior.

## Core defaults

- Prefer the simplest viable design.
- Default to:
  - one certified node
  - deterministic implementation first
  - one meaningful public provide unless the brief clearly needs more
- Keep the protocol capability-first.
- Treat commands, tools, and prompts as projections or internals, not the canonical protocol contract.
- Keep internal prompts/instructions non-public by default.
- Only recommend a collaborating pair when the brief clearly implies delegation or separable responsibilities.
- Do not silently switch to local file creation when an extension-building request cannot stay on the protocol path; surface the missing capability explicitly.
