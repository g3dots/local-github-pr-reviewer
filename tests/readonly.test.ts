import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ALLOWED_GH_CALLERS = new Set([
  resolve(ROOT, "packages/server/src/github.ts"),
  resolve(ROOT, "packages/server/src/repoDetect.ts"),
]);

/**
 * Recursively walks a directory, returning all .ts/.tsx/.mjs files outside
 * common ignore paths.
 */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry === "build" ||
      entry === "data" ||
      entry.startsWith(".")
    )
      continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const GH_SPAWN_REGEX = /(?:spawn|execFile|exec|spawnSync|execSync)\s*\(\s*['"]gh['"]/;

describe("read-only invariant", () => {
  it("only github.ts and repoDetect.ts may invoke the gh CLI", () => {
    const offenders: { file: string; line: number; text: string }[] = [];
    for (const file of collectSourceFiles(ROOT)) {
      if (ALLOWED_GH_CALLERS.has(file)) continue;
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (GH_SPAWN_REGEX.test(line)) {
          offenders.push({ file, line: i + 1, text: line.trim() });
        }
      }
    }
    if (offenders.length > 0) {
      const summary = offenders.map((o) => `  ${o.file}:${o.line}\n    ${o.text}`).join("\n");
      throw new Error(`Found gh invocations outside the allow-list:\n${summary}`);
    }
    expect(offenders).toEqual([]);
  });

  it("repoDetect uses gh only for read-only `repo view`", () => {
    const path = resolve(ROOT, "packages/server/src/repoDetect.ts");
    const content = readFileSync(path, "utf8");
    // Allow only the literal `["repo", "view", ...]` invocation.
    const ghCalls = content.match(/spawn\s*\(\s*["']gh["'][^)]+\)/g) ?? [];
    expect(ghCalls.length).toBe(1);
    expect(ghCalls[0]).toMatch(/"repo"\s*,\s*"view"/);
  });
});
