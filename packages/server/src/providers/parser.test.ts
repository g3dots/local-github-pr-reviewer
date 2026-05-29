import { describe, it, expect } from "vitest";
import { parseReviewOutput, parseRevalidateOutput } from "./parser.js";

describe("parseReviewOutput", () => {
  it("extracts comments from a fenced json block at the end of the response", () => {
    const raw = `
Some narration first.

\`\`\`json
{
  "summary": "Looks mostly fine, one concern.",
  "comments": [
    { "path": "src/foo.ts", "line": 12, "side": "RIGHT", "severity": "concern",
      "body": "This drops the error." }
  ]
}
\`\`\`
`;
    const out = parseReviewOutput(raw);
    expect(out.summary).toBe("Looks mostly fine, one concern.");
    expect(out.comments).toHaveLength(1);
    expect(out.comments[0]).toMatchObject({
      path: "src/foo.ts",
      line: 12,
      side: "RIGHT",
      severity: "concern",
    });
  });

  it("defaults side to RIGHT when omitted and a path is present", () => {
    const raw =
      '```json\n{"summary":"","comments":[{"path":"a.ts","line":1,"severity":"nit","body":"x"}]}\n```';
    const out = parseReviewOutput(raw);
    expect(out.comments[0]!.side).toBe("RIGHT");
  });

  it("uses the LAST json block when multiple are present", () => {
    const raw = `
\`\`\`json
{"summary":"ignored draft","comments":[{"path":"a.ts","line":1,"severity":"nit","body":"old"}]}
\`\`\`

revised version below

\`\`\`json
{"summary":"final","comments":[{"path":"b.ts","line":2,"severity":"concern","body":"new"}]}
\`\`\`
`;
    const out = parseReviewOutput(raw);
    expect(out.summary).toBe("final");
    expect(out.comments[0]!.body).toBe("new");
  });

  it("returns empty result when no json block is present", () => {
    const out = parseReviewOutput("Just a freeform response, no JSON at all.");
    expect(out.comments).toEqual([]);
    expect(out.summary).toBe("");
  });

  it("returns empty result on malformed JSON", () => {
    const raw = '```json\n{ "summary": "broken", "comments": [\n```';
    const out = parseReviewOutput(raw);
    expect(out.comments).toEqual([]);
  });

  it("falls back to extracting a raw {…} blob when no fence is present", () => {
    const raw =
      'thinking… {"summary":"raw","comments":[{"path":"a.ts","line":3,"severity":"concern","body":"q"}]}';
    const out = parseReviewOutput(raw);
    expect(out.summary).toBe("raw");
    expect(out.comments).toHaveLength(1);
  });
});

describe("parseRevalidateOutput", () => {
  it("returns the resolved flag and explanation", () => {
    const raw = '```json\n{"resolved": true, "explanation": "Fixed in src/foo.ts:42."}\n```';
    const out = parseRevalidateOutput(raw);
    expect(out).toEqual({ resolved: true, explanation: "Fixed in src/foo.ts:42." });
  });

  it("returns null when no parseable block is present", () => {
    expect(parseRevalidateOutput("nothing here")).toBeNull();
  });
});
