---
name: reviewer-mcp
description: Use the local GitHub PR Reviewer MCP to run, await, recover, and validate durable pull-request reviews without polling or duplicate review work. Apply when using local-github-pr-reviewer tools; this does not grant permission to change, push, or merge a PR.
---

# Reviewer MCP

Use the Reviewer's persisted lifecycle as the source of truth. Keep the durable `reviewId` returned by `trigger_review`; an in-memory `jobId`, a UI count, or an open MCP connection is not the review handle.

## Review workflow

1. Find the local `prId` with `list_my_prs`, or list registered repositories and then their PRs. Register a repository only when it is in the user's scope.
2. Call `get_pr_details` before the gate review to refresh GitHub data. Record `pr.head_sha` as the expected head.
3. Apply a preset or configuration only when the task calls for it. Do so before triggering the review.
4. Call `trigger_review` once. Save its positive `reviewId`. A response with `joined: true` means another process already owns the same active review; use the returned ID without triggering again.
5. Call `await_review` once with that `reviewId`. Let the call remain open until it returns a terminal result. The server publishes completion and all threads atomically and enforces a bounded lifecycle. Progress may be emitted about every 10 seconds when the client supports it.
6. Treat the returned result as complete only when its status is `completed`. Use the threads returned by `await_review`; do not make a second query merely to guess whether publication finished.
7. Refresh with `get_pr_details` after completion and compare its current `pr.head_sha` with the completed result's `headSha`. The review gates the PR only when they match.

For an immediate persisted snapshot outside the active wait—for example, when inspecting an already-reviewed PR—use `get_review_threads`. It is not a completion-waiting loop.

## Recovery

- If the client disconnects, restarts, or an `await_review` attempt ends because of a transport timeout, reconnect and call `await_review` again with the same `reviewId`. Only retry after the previous call has ended; never run parallel awaiters.
- If the wait reaches its own timeout, the review may still be active. Re-enter `await_review` with the same `reviewId`; do not trigger a replacement.
- If the `reviewId` was lost but the `prId` is known, call `get_review_threads` once and use the latest persisted review ID. Await it if its status is still `running`.
- If the review returns a terminal error, report the error and correct the cause only within the user's authorized scope. A later retry should use one new `trigger_review` call and its new `reviewId`.
- If the PR head changed after a completed review, that result does not gate the new head. Refresh the PR, trigger one new review, and await its returned ID.

Do not call `clear_pr_review` as ordinary recovery. It deletes review history and threads; use it only when the user explicitly wants that data cleared or a task specifically requires a clean slate.

## Gate criteria

A review gate passes only when all of these are true:

- `await_review` returned `completed` rather than a timeout, transport failure, or terminal error.
- The completed review `headSha` equals the refreshed PR `head_sha`.
- No returned open, non-stale thread requires action under the requested review policy.
- Any separate CI, approval, or merge requirements also pass.
- The user has authorized any subsequent mutation such as pushing fixes, resolving threads, or merging.

## Anti-patterns

Never:

- poll `get_job_status` for a review;
- create timers, watchers, database readers, or background tasks to race `await_review`;
- call `trigger_review` repeatedly while a review is active;
- infer completion from `openThreads`, silence, elapsed time, or the UI alone;
- treat a legacy `jobId` as restart-safe;
- run multiple consumers waiting on the same review to compensate for a slow client;
- accept a clean result without validating the exact reviewed head SHA.

The normal call sequence is:

```text
get_pr_details(prId) -> record expected head SHA
trigger_review(prId) -> save reviewId
await_review(reviewId) -> completed result plus committed threads
get_pr_details(prId) -> confirm current head SHA equals result.headSha
```
