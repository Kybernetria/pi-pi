# Changelog

## Unreleased

- added a compact, host-visible handoff indicator plus separate structured handoff detail records so disclosure UIs can collapse by default and expand on demand without changing the compact protocol result boundary
- added a `protocol-handoff` custom message path so the indicator can render inline in a normal chat session instead of only inside the tool box
- exported explicit handoff indicator/detail shapes in the runtime SDK so host code can reuse the same contract for disclosure rendering
- added a brownfield migration-planning provide and command that inspects an existing repo's commands, scripts, handlers, bootstrap wiring, and docs, then returns a structured Pi Protocol migration plan
- added a reusable protocol routing policy so simple requests stay direct while code-changing requests check protocol first and fall back cleanly when no installed capability fits
- added an internal prompt-awareness helper that is installed through the standard `protocol` projection path so top-level chat can prefer protocol discovery before scaffolding new code
- made `ensureProtocolAgentProjection(...)` registration per runtime/target instead of a blunt process-global singleton, which keeps the `protocol` tool discoverable across repeated startups and multiple runtimes in one process
- improved natural-language planning heuristics so plain-language briefs can infer richer candidate provides and better single-node vs collaborating-pair recommendations
- upgraded generated single-node schemas and handler stubs for common capabilities such as search, summarization, validation, Q&A, task extraction, and classification
- added regression and planning/scaffold verification scripts: `npm run test:regressions` and `npm run test:planning`
- added `npm run test:sdk-session` to verify the standard `protocol` projection and prompt-awareness helper inside a real Pi SDK `AgentSession`
- made `protocol` registry output node-first and tiered so `{ "action": "registry" }` yields a compact node catalog, followed by `describe_node` and `describe_provide` for deeper inspection
- fixed a greenfield scaffold flaw where tiny `ping`/`pong` test packages could drift into validation-shaped schemas and handlers, and added a validator guardrail for obviously wrong `ping` contracts
- normalized `sdkDependency` handling so chat-supplied package names like `@mariozechner/pi-protocol-sdk` no longer corrupt generated dependency entries or README notes
- made large `protocol` registry calls stay node-first and steer the agent toward `describe_node` / `find_provides` instead of dumping hundreds of provides into context
- added brownfield patch-guidance output and validator failure-fixture coverage for bootstrap/session-start and handler wiring edge cases
- added routing-policy test coverage and refreshed prompt/discovery wording for the node-first tiered protocol lookup path
- added `docs/guides/adapt-brownfield-to-pi-protocol-prompt.md` as a copy-paste starter prompt for brownfield migration sessions
