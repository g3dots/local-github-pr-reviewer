import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

export interface DetectedRepo {
  owner: string;
  name: string;
  localPath: string;
}

function ghViewRepo(cwd: string): Promise<{ owner: string; name: string }> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn("gh", ["repo", "view", "--json", "owner,name"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => {
      if (code !== 0) {
        rejectP(new Error(stderr.trim() || `gh repo view failed (exit ${code})`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { owner: { login: string }; name: string };
        resolveP({ owner: parsed.owner.login, name: parsed.name });
      } catch (e) {
        rejectP(new Error(`gh repo view returned non-JSON: ${(e as Error).message}`));
      }
    });
    child.on("error", rejectP);
  });
}

export async function detectRepo(localPath: string): Promise<DetectedRepo> {
  const abs = resolve(localPath);
  if (!existsSync(abs)) {
    throw new Error(`Path does not exist: ${abs}`);
  }
  if (!existsSync(resolve(abs, ".git"))) {
    throw new Error(`Not a git repository: ${abs}`);
  }
  const { owner, name } = await ghViewRepo(abs);
  return { owner, name, localPath: abs };
}
