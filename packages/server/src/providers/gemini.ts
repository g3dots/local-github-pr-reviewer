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
 * Runs `gemini -p` inside the local working copy, with yolo approval so the
 * model can read/grep/run tests without prompting.
 */

async function runGemini(
  prompt: string,
  cwd: string,
  onProgress?: ProviderProgress,
): Promise<string> {
  onProgress?.({ type: "log", data: `[gemini] running in ${cwd}\n` });
  const args = ["--approval-mode", "yolo", "-p", prompt];
  const res = await spawnCli({
    cmd: "gemini",
    args,
    cwd,
    onProgress,
    timeoutMs: 15 * 60 * 1000,
  });
  if (res.exitCode !== 0) {
    throw new Error(`gemini exited ${res.exitCode}: ${res.stderr.slice(0, 500)}`);
  }
  return res.stdout;
}

export const geminiProvider: Provider = {
  id: "gemini",
  displayName: "Gemini (CLI)",

  async isAvailable() {
    return commandExists("gemini");
  },

  async review(ctx, onProgress) {
    const prompt = buildReviewPrompt(ctx);
    const raw = await runGemini(prompt, ctx.cwd, onProgress);
    const { summary, comments } = parseReviewOutput(raw);
    return { summary, comments, rawOutput: raw } satisfies ReviewResult;
  },

  async reply(ctx, onProgress) {
    const prompt = buildReplyPrompt(ctx);
    const raw = await runGemini(prompt, ctx.cwd, onProgress);
    return { body: raw.trim(), rawOutput: raw } satisfies ReplyResult;
  },

  async revalidate(ctx, onProgress) {
    const prompt = buildRevalidatePrompt(ctx);
    const raw = await runGemini(prompt, ctx.cwd, onProgress);
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
