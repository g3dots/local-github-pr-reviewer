# Security

This project is local-first by design. This file explains the guarantees we
try to make, how they are enforced, and how to report a vulnerability.

## Threat model in one paragraph

You run this tool against repos you already have read access to, on your own
machine. The reviewer reads diffs, reads your local working copy, and asks
a locally-installed AI CLI for opinions. We assume that AI CLI is trusted
and authenticated by you. We do not assume any other user is on the same
machine.

## What we promise

1. **No writes to GitHub.** The tool only ever reads from GitHub.
   - Every call to `gh` goes through a single module
     ([`packages/server/src/github.ts`](packages/server/src/github.ts)).
   - That module hard-rejects any `gh` subcommand outside a small
     allow-list (`pr list|view|diff`, `api` GET only, `auth status`).
   - A unit test ([`tests/readonly.test.ts`](tests/readonly.test.ts))
     enforces that **no other file** in the codebase invokes `gh` via
     `spawn`, `exec`, or any related Node API. The test fails CI if it
     finds one.

2. **Local only.** The server binds to `127.0.0.1` by default. There is no
   authentication layer because there is nothing remote to authenticate.
   If you change `host` in `config.json` to bind to a non-loopback
   interface, you are taking responsibility for who can reach the port.

3. **No telemetry, no analytics, no auto-update.** The reviewer makes no
   outbound network calls except the ones `gh` and your chosen AI CLI
   make on your behalf.

4. **Per-PR data is ephemeral.** When a PR is merged or closed on GitHub,
   all local review data for it is deleted on the next server launch.

## What we do **not** promise

- We do not sandbox the AI CLI. By design it runs with `cwd` set to your
  local checkout and uses its own tools (Read/Grep/Bash). If you don't
  trust the AI to read or run code in that directory, don't point the
  reviewer at it.
- We do not vet what the AI says. The reviewer surfaces AI output verbatim.
  Use your judgment.

## Reporting a vulnerability

If you discover anything that:

- causes data to be posted, pushed, or otherwise written back to GitHub,
- allows a non-local party to interact with the running server,
- leaks repository contents outside the configured AI CLI flow,

please open a [GitHub security advisory](https://github.com/serge-mugisha/local-github-pr-reviewer/security/advisories/new)
rather than a public issue. I aim to acknowledge within 7 days.

For non-sensitive bugs that don't violate the guarantees above, a normal
issue is fine.

## Verifying the read-only claim yourself

```bash
# 1. Run the enforcement test.
npm test

# 2. Search the codebase for any direct gh invocation outside github.ts.
grep -rE "spawn\\(['\"]gh['\"]|exec\\(['\"]gh" packages scripts \
  --include='*.ts' --include='*.tsx' --include='*.mjs' \
  | grep -v 'packages/server/src/github.ts'
# Expected: no matches.

# 3. Inspect the allow-list.
sed -n '1,40p' packages/server/src/github.ts
```
