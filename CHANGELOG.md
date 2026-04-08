# Changelog

## Unreleased

- added an internal prompt-awareness helper that is installed through the standard `protocol` projection path so top-level chat can prefer protocol discovery before scaffolding new code
- made `ensureProtocolAgentProjection(...)` registration per runtime/target instead of a blunt process-global singleton, which keeps the `protocol` tool discoverable across repeated startups and multiple runtimes in one process
- improved natural-language planning heuristics so plain-language briefs can infer richer candidate provides and better single-node vs collaborating-pair recommendations
- upgraded generated single-node schemas and handler stubs for common capabilities such as search, summarization, validation, Q&A, task extraction, and classification
- added regression and planning/scaffold verification scripts: `npm run test:regressions` and `npm run test:planning`
- added `npm run test:sdk-session` to verify the standard `protocol` projection and prompt-awareness helper inside a real Pi SDK `AgentSession`
- made `protocol` registry output concise and token-efficient so a plain `{ "action": "registry" }` call yields a compact catalog of available public provides
