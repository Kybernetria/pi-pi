# pi-pi

`pi-pi` is the chat-first authoritative builder for [pi-protocol] certified packages.

## Public protocol surface

- `chat_pi_pi`

That is the only public provide.

## Public outcomes

- `clarification_needed` — the ask is in scope, but pi-pi needs more information or confirmation before it can proceed
- `completed` — pi-pi completed its internal certified build path and can include nested runtime-verified build details
- `unsupported` — the ask is outside pi-pi's current certified package scope

## Multi-turn delegated chat contract

`chat_pi_pi` is now explicitly conversational.

Input:

- `message` — required natural-language turn text
- `conversationToken` — optional token that resumes an existing delegated pi-pi conversation
- `repoDir`, `applyChanges`, `replaceExisting` — optional execution hints

Output may include:

- `continuation.token`
- `continuation.state` — `awaiting_user`, `awaiting_caller`, or `closed`
- `continuation.owner` — the node/provide that currently owns the floor

## Generated package model

Generated packages stay TypeScript-first, manifest-first via `pi.protocol.json`, and self-contained with a vendored `vendor/pi-protocol-sdk.ts`.

## Quick use

```json
{
  "action": "invoke",
  "request": {
    "provide": "chat_pi_pi",
    "target": { "nodeId": "pi-pi" },
    "input": {
      "message": "Build me an extension that summarizes markdown notes and offers a local command.",
      "repoDir": "./packages/pi-notes",
      "applyChanges": true
    },
    "handoff": { "opaque": true }
  }
}
```

Important: protocol callers must use `input.message` for natural-language input. Do not substitute `text`, `prompt`, `query`, or `content`.
If pi-pi returns `continuation.state: "awaiting_user"`, route the next user turn back to `chat_pi_pi` with the same `conversationToken`.

Or from the UI:

```text
/chat-pi-pi build me an extension that summarizes markdown notes and offers a local command
```

## Install/load a generated package

```bash
npm install
pi install /absolute/path/to/package
# or: pi install ./relative/path/to/package
/reload
```

## Canonical contract

Public `provides` are the only real inter-package contract.

For contributor workflow see `CONTRIBUTING.md`. For internal boundaries and module ownership see `docs/ARCHITECTURE.md`.
