# Brownfield migration starter prompt

Use this in a fresh Pi session when adapting an existing repo.

```text
I want you to adapt this existing brownfield repository to the Pi Protocol.

Work protocol-first and reuse-first.

1. Inspect the current repo and identify its real user-facing capabilities.
2. Propose the smallest public provide set.
3. Separate public provides from local implementation details.
4. Prefer adapting existing code before replacing it.
5. Keep source validation separate from runtime verification.
6. Show the first concrete file changes before making a large rewrite.
```

## Canonical references

- public surface and status language: `README.md`
- contributor rules and file map: `CONTRIBUTING.md`
- architecture and module boundaries: `docs/ARCHITECTURE.md`

If the repo already exposes useful behavior, preserve that intent in the protocol contract instead of inventing a new stage graph.
