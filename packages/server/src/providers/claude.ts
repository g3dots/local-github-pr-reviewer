import type {
  Provider,
  ReviewResult,
  ReplyResult,
  RevalidateResult,
  ProviderProgress,
} from "./types.js";
import { buildReviewPrompt, buildReplyPrompt, buildRevalidatePrompt } from "./prompt.js";
import { parseReviewOutput, parseRevalidateOutput } from "./parser.js";
import { spawnCli, commandExists } from "./spawn.js";

/**
 * Runs `claude -p` inside the local working copy. The model brings its own
 * Read/Grep/Bash tools — we just hand it a prompt and a cwd.
 */

interface ClaudeJsonResult {
  result?: string;
  is_error?: boolean;
  error?: string;
  session_id?: string;
}

async function runClaude(
  prompt: string,
  cwd: string,
  onProgress?: ProviderProgress,
): Promise<string> {
  onProgress?.({ type: "log", data: `[claude] running in ${cwd}\n` });
  const args = ["-p", "--output-format", "json", "--permission-mode", "bypassPermissions"];
  const res = await spawnCli({
    cmd: "claude",
    args,
    cwd,
    stdin: prompt,
    onProgress,
    timeoutMs: 15 * 60 * 1000,
  });
  if (res.exitCode !== 0) {
    throw new Error(`claude exited ${res.exitCode}: ${res.stderr.slice(0, 500)}`);
  }
  // With --output-format json, stdout is a JSON object containing `result`.
  try {
    const parsed = JSON.parse(res.stdout) as ClaudeJsonResult;
    if (parsed.is_error) throw new Error(parsed.error || "claude reported an error");
    return parsed.result ?? "";
  } catch (e) {
    // If for some reason stdout isn't JSON, fall back to raw.
    if (res.stdout.trim()) return res.stdout;
    throw new Error(`claude output not parseable: ${(e as Error).message}`);
  }
}

export const claudeProvider: Provider = {
  id: "claude",
  displayName: "Claude (CLI)",

  async isAvailable() {
    return commandExists("claude");
  },

  async review(ctx, onProgress) {
    const prompt = buildReviewPrompt(ctx);
    const raw = await runClaude(prompt, ctx.cwd, onProgress);
    const { summary, comments } = parseReviewOutput(raw);
    return { summary, comments, rawOutput: raw } satisfies ReviewResult;
  },

  async reply(ctx, onProgress) {
    const prompt = buildReplyPrompt(ctx);
    const raw = await runClaude(prompt, ctx.cwd, onProgress);
    return { body: raw.trim(), rawOutput: raw } satisfies ReplyResult;
  },

  async revalidate(ctx, onProgress) {
    const prompt = buildRevalidatePrompt(ctx);
    const raw = await runClaude(prompt, ctx.cwd, onProgress);
    const parsed = parseRevalidateOutput(raw);
    if (!parsed) {
      return {
        resolved: false,
        body: raw.trim() || "Could not parse revalidation result.",
        rawOutput: raw,
      };
    }
    return {
      resolved: parsed.resolved,
      body: parsed.explanation,
      rawOutput: raw,
    } satisfies RevalidateResult;
  },
};
