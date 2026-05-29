import { describe, it, expect } from "vitest";
import { parseUnifiedDiff } from "./diff.js";

const SAMPLE = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,6 @@
 export function add(a: number, b: number): number {
-  return a + b;
+  // explicit cast to keep TS happy
+  return Number(a) + Number(b);
 }

 export const ZERO = 0;
diff --git a/src/bar.ts b/src/bar.ts
new file mode 100644
--- /dev/null
+++ b/src/bar.ts
@@ -0,0 +1,2 @@
+export const HI = "hi";
+export const BYE = "bye";
`;

describe("parseUnifiedDiff", () => {
  it("splits multi-file diffs into files", () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files).toHaveLength(2);
    expect(files[0]!.newPath).toBe("src/foo.ts");
    expect(files[1]!.newPath).toBe("src/bar.ts");
  });

  it("tracks correct line numbers for context/add/del", () => {
    const files = parseUnifiedDiff(SAMPLE);
    const hunk = files[0]!.hunks[0]!;
    const codeLines = hunk.lines.filter((l) => l.kind !== "hunk" && l.kind !== "meta");
    const firstCtx = codeLines.find((l) => l.kind === "context")!;
    expect(firstCtx.oldLine).toBe(1);
    expect(firstCtx.newLine).toBe(1);
    const del = codeLines.find((l) => l.kind === "del")!;
    expect(del.oldLine).toBe(2);
    expect(del.newLine).toBeUndefined();
    const adds = codeLines.filter((l) => l.kind === "add");
    expect(adds).toHaveLength(2);
    expect(adds[0]!.newLine).toBe(2);
    expect(adds[1]!.newLine).toBe(3);
  });

  it("handles new files (oldPath null)", () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files[1]!.oldPath).toBeNull();
    const hunk = files[1]!.hunks[0]!;
    const adds = hunk.lines.filter((l) => l.kind === "add");
    expect(adds).toHaveLength(2);
    expect(adds[0]!.newLine).toBe(1);
    expect(adds[1]!.newLine).toBe(2);
  });

  it("returns an empty array for an empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});
