# Local GitHub PR Reviewer

A local, **read-only** GitHub PR reviewer. Pulls PRs through the GitHub CLI,
hands the diff and your local working copy to a local AI CLI of your choice,
and surfaces inline comments and a per-thread chat in a web UI that resembles
the GitHub PR view.

The reviewer **never writes back to GitHub**. Comments and conversations live
in a local SQLite database and are automatically deleted when a PR is merged
or closed.

[![CI](https://github.com/serge-mugisha/local-github-pr-reviewer/actions/workflows/ci.yml/badge.svg)](https://github.com/serge-mugisha/local-github-pr-reviewer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Why

Most PR-review bots post directly to GitHub — noisy for teammates, awkward
during iteration, and they can't see beyond the diff. This tool:

- Runs entirely on your machine. Your code stays local.
- Uses **your local AI CLI** (Claude Code or Gemini CLI today) with full
  read access to the working copy, so the reviewer can grep, read whole
  files, and look at tests before commenting.
- Is **strictly read-only** against GitHub. Nothing you do here ever
  surfaces on the real PR.
- Persists conversations per PR until merge; cleans up automatically.
- Lets you teach it per-repo rules ("focus on auth", "ignore dependabot")
  via a free-form markdown skills file.
- Has a revalidate-per-thread button: after you push a fix, ask the
  reviewer to check whether the concern is now addressed.

## Requirements

- **Node.js 20+**
- **`gh`** (the GitHub CLI), authenticated (`gh auth login`)
- At least one supported AI CLI on your `PATH`:
  - [Claude Code](https://docs.claude.com/en/docs/claude-code)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- Local clones of the repositories you want to review

## Install

```bash
git clone https://github.com/serge-mugisha/local-github-pr-reviewer.git
cd local-github-pr-reviewer
npm install
npm run build
```

## Configure

Copy the example config and tell the reviewer where your local clones live:

```bash
cp config.example.json config.json
```

```json
{
  "provider": "claude",
  "port": 47823,
  "host": "127.0.0.1",
  "repos": [{ "owner": "you", "name": "your-repo", "localPath": "/abs/path/to/clone" }]
}
```

You can also add and remove repos at runtime from the **Settings** page —
paste a local path, the server runs `gh repo view` inside it, and the
GitHub owner/name is auto-detected.

### Gemini authentication

Google is retiring personal-account login for the Gemini CLI (`Code Assist
for individuals`), so reviews fail with `IneligibleTierError`. Authenticate
with an API key instead — either set `GEMINI_API_KEY` in the environment, or
add a `gemini` block to `config.json`:

```json
{
  "provider": "gemini",
  "gemini": { "apiKey": "YOUR_KEY", "model": "gemini-2.5-pro" }
}
```

Get a key at <https://aistudio.google.com/apikey>. `model` is optional.

## Run

```bash
npm start        # production: serves UI + API at http://127.0.0.1:47823
npm run dev      # dev: API at :47823, Vite UI with HMR at :47824
npm run stop     # graceful shutdown if you lose the terminal
```

Open `http://127.0.0.1:47823` (or `:47824` in dev).

## Usage

1. From the home page, pick a PR. The list auto-refreshes from GitHub on load.
2. Click **Run review**. The AI investigates the working copy and posts
   inline comments anchored to the diff.
3. **Reply** on any thread to have a conversation with the reviewer about
   that specific concern. The AI has full repo access for each reply.
4. **Revalidate** after pushing a fix — the reviewer re-inspects the
   current working copy and either auto-resolves the thread or explains
   what's still missing.
5. **Mark resolved** to manually close a thread.
6. **Clear review** removes the local review (threads, comments, history)
   for a PR while keeping the PR in the list, so you can start over.
7. Use **Skills** (per repo) to give the reviewer durable instructions:
   files to focus on, patterns to ignore, etc.

When a PR is merged or closed on GitHub, all local review data for it is
deleted on the next server launch.

## Read-only guarantee

Every call to `gh` flows through a single module, [`packages/server/src/github.ts`](packages/server/src/github.ts).
That module:

- Only exposes read methods (`listOpenPRs`, `getPR`, `getPRDiff`, …).
- Whitelists subcommands (`pr list|view|diff`, `api` GET only, `auth status`).
- Rejects any non-GET use of `gh api`.

A unit test enforces that **no other file in the codebase** invokes `gh`
via `spawn`/`exec`. See [SECURITY.md](SECURITY.md) for details.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  React UI (Vite)                                 │
│  PR list · diff viewer · threads · chat · skills │
└──────────────────┬───────────────────────────────┘
                   │  REST + SSE  (127.0.0.1 only)
┌──────────────────▼───────────────────────────────┐
│  Node server (Fastify)                           │
└──┬───────────────┬──────────────────┬────────────┘
   │               │                  │
   ▼               ▼                  ▼
 gh CLI         SQLite          Provider registry
 (read-only)    (better-sqlite3) ┌─────────┬─────────┐
                                 │ claude  │ gemini  │  … extend here
                                 └────┬────┴────┬────┘
                                      │ spawned with cwd = local checkout
                                      ▼
                              Local repo working copy
```

## Adding a new AI provider

Implement the `Provider` interface and register it.

1. Create `packages/server/src/providers/<name>.ts`.
2. Implement `review`, `reply`, and `revalidate`. Most providers shell out
   to a CLI via `spawnCli` (see [`claude.ts`](packages/server/src/providers/claude.ts) or [`gemini.ts`](packages/server/src/providers/gemini.ts) — each is ~70 lines).
3. Add to the registry in [`providers/index.ts`](packages/server/src/providers/index.ts).
4. Add the id to the `provider` enum in [`config.ts`](packages/server/src/config.ts) if you want it
   selectable from the UI.

## Project layout

```
local-github-pr-reviewer/
├── packages/
│   ├── server/  Fastify + SQLite + provider adapters
│   └── web/     Vite + React UI
├── scripts/     Operational helpers (stop, etc.)
├── tests/       Cross-package tests (read-only invariant, etc.)
├── config.example.json
└── README.md
```

## Contributing

Issues and PRs welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE)
