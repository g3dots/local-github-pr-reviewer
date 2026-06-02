export interface DiffLine {
  kind: "context" | "add" | "del" | "hunk" | "meta";
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string | null;
  newPath: string;
  hunks: DiffHunk[];
}

/** A single file's slice of a multi-file unified diff, kept as raw patch text. */
export interface PatchFile {
  /** Display path — the new path, or the old path for deletions. */
  path: string;
  /** Raw `diff --git …` block for this one file, ready to hand to a renderer. */
  patch: string;
}

/**
 * Split a raw multi-file `git diff` into one self-contained patch per file.
 *
 * Unlike {@link parseUnifiedDiff}, this preserves the original patch text so it
 * can be handed verbatim to a diff renderer (e.g. `@pierre/diffs`' `PatchDiff`),
 * which does its own parsing and syntax highlighting.
 */
export function splitPatchByFile(raw: string): PatchFile[] {
  const out: PatchFile[] = [];
  const lines = raw.split("\n");
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    const block = lines.slice(start, end);
    out.push({ path: pathFromBlock(block), patch: block.join("\n") });
  };
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith("diff --git")) {
      flush(i);
      start = i;
    }
  }
  flush(lines.length);
  return out;
}

function pathFromBlock(block: string[]): string {
  let oldPath: string | null = null;
  let newPath: string | null = null;
  for (const l of block) {
    if (l.startsWith("+++ b/")) newPath = l.slice(6);
    else if (l.startsWith("+++ ")) newPath = l.slice(4) === "/dev/null" ? null : l.slice(4);
    else if (l.startsWith("--- a/")) oldPath = l.slice(6);
    else if (l.startsWith("--- ")) oldPath = l.slice(4) === "/dev/null" ? null : l.slice(4);
    if (newPath) break;
  }
  if (newPath) return newPath;
  if (oldPath) return oldPath;
  // Fall back to the `diff --git a/x b/y` header.
  const m = block[0]?.match(/^diff --git a\/(.+) b\/(.+)$/);
  return m ? m[2]! : "(unknown)";
}

export function parseUnifiedDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("diff --git")) {
      // Collect header until first @@ or next 'diff --git'
      let oldPath: string | null = null;
      let newPath: string | null = null;
      i++;
      while (
        i < lines.length &&
        !lines[i]!.startsWith("@@") &&
        !lines[i]!.startsWith("diff --git")
      ) {
        const l = lines[i]!;
        if (l.startsWith("--- a/")) oldPath = l.slice(6);
        else if (l.startsWith("--- ")) oldPath = l.slice(4) === "/dev/null" ? null : l.slice(4);
        else if (l.startsWith("+++ b/")) newPath = l.slice(6);
        else if (l.startsWith("+++ ")) newPath = l.slice(4);
        i++;
      }
      const file: DiffFile = { oldPath, newPath: newPath ?? oldPath ?? "(unknown)", hunks: [] };
      while (i < lines.length && lines[i]!.startsWith("@@")) {
        const header = lines[i]!;
        const m = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        let oldN = m ? parseInt(m[1]!, 10) : 0;
        let newN = m ? parseInt(m[3]!, 10) : 0;
        const hunk: DiffHunk = { header, lines: [{ kind: "hunk", text: header }] };
        i++;
        while (
          i < lines.length &&
          !lines[i]!.startsWith("@@") &&
          !lines[i]!.startsWith("diff --git")
        ) {
          const l = lines[i]!;
          if (l.startsWith("+")) {
            hunk.lines.push({ kind: "add", text: l.slice(1), newLine: newN++ });
          } else if (l.startsWith("-")) {
            hunk.lines.push({ kind: "del", text: l.slice(1), oldLine: oldN++ });
          } else if (l.startsWith("\\")) {
            hunk.lines.push({ kind: "meta", text: l });
          } else {
            hunk.lines.push({
              kind: "context",
              text: l.startsWith(" ") ? l.slice(1) : l,
              oldLine: oldN++,
              newLine: newN++,
            });
          }
          i++;
        }
        file.hunks.push(hunk);
      }
      files.push(file);
    } else {
      i++;
    }
  }
  return files;
}
