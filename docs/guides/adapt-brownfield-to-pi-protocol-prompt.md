# Adapt a brownfield repo to Pi Protocol — starter prompt

Use this as a copy-paste prompt in a fresh Pi session when you want help adapting an existing repository to the Pi Protocol instead of scaffolding a greenfield package.

```text
I want you to adapt this existing brownfield repository to the Pi Protocol.

Work protocol-first and reuse-first.
Do not jump straight into scaffolding a brand-new package unless the repo clearly has nothing reusable.

Please do this in phases:

1. Inspect the current repository
   - identify existing commands, tools, prompts, handlers, services, CLIs, scripts, and extension entrypoints
   - identify the repo's current user-facing capabilities
   - identify what should become public provides vs internal implementation details

2. Produce a migration plan
   - map existing capabilities to Pi Protocol provides/projections
   - recommend whether this should become:
     - one certified node, or
     - a collaborating pair / multiple nodes
   - explain the tradeoffs briefly
   - call out reuse opportunities before proposing new code

3. Define the protocol contract
   - propose nodeId/package name(s)
   - propose public provide names
   - propose input/output schemas
   - keep contracts typed, compact, and stable
   - keep internal prompts/instructions non-public unless there is a strong reason otherwise

4. Implement the migration incrementally
   - prefer the smallest safe patch set first
   - preserve existing working behavior where possible
   - add or adapt pi.protocol.json, handlers, schemas, and bootstrap wiring
   - ensure standard protocol projection bootstrap is present
   - use protocol-native delegation surfaces for any cross-node calls

5. Validate and explain
   - run available validation/tests where possible
   - explain what was migrated, what remains manual, and what risks or follow-up work remain

Important constraints:
- prefer adapting existing code over replacing it
- do not invent unnecessary nodes or provides
- avoid direct sibling certified-node imports
- keep the package installable and TypeScript-first
- if the repo already exposes a useful capability, preserve its intent in the protocol contract
- if something is ambiguous, stop and present the migration options before making a large rewrite

At the start, give me:
- a short summary of what this repo appears to do
- the likely certified-node shape
- the proposed provide map
- the first concrete migration step you want to take
```

## Suggested follow-up prompt

After the first analysis pass, a good follow-up is:

```text
Now implement the smallest correct first migration step and show me the exact files you plan to change before editing.
```
