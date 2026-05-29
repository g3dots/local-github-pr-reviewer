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
