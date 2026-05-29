import type { ReviewContext, ReplyContext, RevalidateContext } from "./types.js";

const REVIEW_INSTRUCTIONS = `
You are a local pull-request reviewer. You have full read access to the working
copy at the current working directory. USE YOUR TOOLS: read changed files in
full, grep for callers, look at tests, run quick commands. Investigate before
commenting.

CRITICAL: default to saying NOTHING. Code is allowed to be imperfect. Your
job is NOT to make this PR "better" — it's to catch things the author would
genuinely thank you for catching. Most well-formed PRs should receive ZERO
comments. An empty comments array is a valid, common, often correct result.

ONLY comment when something falls into one of these categories:

1. **Bugs**: the code will produce wrong behavior, crash, or fail to handle
   a real (not hypothetical) case. Include enough specifics that the author
   can verify the bug exists.
2. **Regressions**: this change breaks behavior that previously worked, or
   removes/weakens an existing guarantee (auth, validation, error handling,
   contract with callers, test coverage of a real risk).
3. **Security / data-integrity issues**: secrets, injection, missing
   authz/authn checks, unsafe deserialization, race conditions on shared
   state, broken transaction boundaries, etc.
4. **Genuinely terrible patterns** (not merely "could be cleaner"): an
   approach that will actively cause pain — quadratic loops on hot paths,
   blocking I/O in the wrong place, swallowed exceptions that hide real
   failures, a class hierarchy that already shows it cannot scale, etc.
5. **Code duplication** that materially raises maintenance cost: the same
   non-trivial logic copied across files such that future changes will go
   out of sync. Trivial near-duplicates are NOT comment-worthy.
6. **Violations of the repo-specific rules below** ("Reviewer rules for
   this repo"). Treat those as the author's explicit asks — always flag.

DO NOT comment on any of the following:
- Style, formatting, naming preferences, import order, whitespace.
- "Could be more elegant", "consider extracting", "this might be cleaner as".
- Missing tests for trivial code, missing docstrings, missing comments.
- Defensive checks for situations that cannot actually occur in this codebase.
- Hypothetical performance concerns that aren't on a hot path.
- Praise or general approval — return an empty array instead.
- Anything you wouldn't bring up if the author were sitting next to you and
  had ten minutes to merge.

Severity scale (used in the JSON output):
- "blocker": will break something real if merged.
- "concern": a category 1–6 issue worth addressing but not strictly merge-blocking.
- "nit":     reserved. Do not use unless the issue is concrete, takes <30
             seconds to fix, and you'd still flag it if you had to defend it.
- "praise":  do not use.

Anchor each comment to a path + line in the NEW file (side="RIGHT") whenever
possible. Use side="LEFT" only for comments about removed lines. If a comment
is repo-wide and not line-specific, omit path and line.
`.trim();

const OUTPUT_INSTRUCTIONS = `
At the very end of your response, return EXACTLY ONE fenced JSON code block
with this schema and nothing after it:

\`\`\`json
{
  "summary": "one short paragraph summarizing the review",
  "comments": [
    {
      "path": "src/foo.ts",
      "line": 42,
      "side": "RIGHT",
      "severity": "concern",
      "body": "Markdown body. Be specific. Reference symbols by name."
    }
  ]
}
\`\`\`

If you have no comments, return an empty "comments" array. That is the most
common outcome for a well-formed PR; do not invent comments to fill space.
`.trim();

export function buildReviewPrompt(ctx: ReviewContext): string {
  const threads = ctx.existingOpenThreads.length
    ? ctx.existingOpenThreads
        .map(
          (t) => `- ${t.path ?? "(no file)"}${t.line != null ? `:${t.line}` : ""} — ${t.summary}`,
        )
        .join("\n")
    : "(none)";
  const skills = ctx.skills.trim() || "(none)";
  return [
    REVIEW_INSTRUCTIONS,
    "",
    `# Repository`,
    `${ctx.repoSlug} @ ${ctx.headSha} (base ${ctx.baseSha})`,
    "",
    `# Pull request #${ctx.prNumber}: ${ctx.prTitle}`,
    ctx.prBody.trim() || "(no description)",
    "",
    `# Reviewer rules for this repo (follow these strictly)`,
    skills,
    "",
    `# Existing open threads — do NOT duplicate these`,
    threads,
    "",
    `# Diff`,
    "```diff",
    ctx.diff,
    "```",
    "",
    OUTPUT_INSTRUCTIONS,
  ].join("\n");
}

export function buildReplyPrompt(ctx: ReplyContext): string {
  const anchor = ctx.threadAnchor.path
    ? `${ctx.threadAnchor.path}${ctx.threadAnchor.line != null ? `:${ctx.threadAnchor.line}` : ""}`
    : "(PR-level)";
  const history = ctx.threadHistory.map((m) => `**${m.author}:** ${m.body}`).join("\n\n");
  const skills = ctx.skills.trim() || "(none)";
  return [
    "You are continuing a code-review conversation on a pull request.",
    "You have read access to the working copy at the current cwd. Investigate before answering.",
    "Reply in markdown. Be concise. No JSON wrapping required.",
    "",
    `# Repository`,
    `${ctx.repoSlug} @ ${ctx.headSha}`,
    "",
    `# PR #${ctx.prNumber}: ${ctx.prTitle}`,
    "",
    `# Thread anchor: ${anchor}`,
    "",
    `# Reviewer rules for this repo`,
    skills,
    "",
    `# Conversation so far`,
    history,
    "",
    `# New user message`,
    ctx.userMessage,
    "",
    "Respond now.",
  ].join("\n");
}

const REVALIDATE_OUTPUT = `
At the very end of your response, return EXACTLY ONE fenced JSON code block
with this schema and nothing after it:

\`\`\`json
{
  "resolved": true,
  "explanation": "Short markdown explanation. If resolved, say what was fixed. If not, say specifically what's still missing or wrong, referencing files/lines."
}
\`\`\`
`.trim();

export function buildRevalidatePrompt(ctx: RevalidateContext): string {
  const anchor = ctx.threadAnchor.path
    ? `${ctx.threadAnchor.path}${ctx.threadAnchor.line != null ? `:${ctx.threadAnchor.line}` : ""}`
    : "(PR-level)";
  const history = ctx.threadHistory.map((m) => `**${m.author}:** ${m.body}`).join("\n\n");
  const skills = ctx.skills.trim() || "(none)";
  return [
    "You are revalidating a previously raised review thread against the CURRENT state of the working copy.",
    "",
    "Determine whether the concern raised in this thread has been addressed in the current code.",
    "Use your tools to look at the actual file(s) and surrounding code. Don't just trust the conversation.",
    "",
    `# Repository`,
    `${ctx.repoSlug} @ ${ctx.headSha} (base ${ctx.baseSha})`,
    "",
    `# PR #${ctx.prNumber}: ${ctx.prTitle}`,
    "",
    `# Thread anchor: ${anchor}`,
    "",
    `# Reviewer rules for this repo`,
    skills,
    "",
    `# Thread history (the original concern and any back-and-forth)`,
    history,
    "",
    "Now: investigate the current code and decide.",
    "- If the concern is fully addressed, set resolved=true.",
    "- If partially addressed or unaddressed, set resolved=false and explain exactly what is still missing.",
    "- If the original concern no longer applies (e.g., the code was removed), set resolved=true and say so.",
    "",
    REVALIDATE_OUTPUT,
  ].join("\n");
}
