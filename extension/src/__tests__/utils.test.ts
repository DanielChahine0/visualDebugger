import { describe, it, expect } from "vitest";
import { extractCodeContext } from "../utils";

describe("extractCodeContext", () => {
  const twentyLines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");

  it("centers on the given line number with +/-10 lines", () => {
    const result = extractCodeContext(twentyLines, 11);
    const lines = result.split("\n");
    // line 11 centered: start = max(0, 11-11) = 0, end = min(20, 11+10) = 20
    expect(lines).toHaveLength(20);
    expect(lines[0]).toBe("1 | line 1");
    expect(lines[19]).toBe("20 | line 20");
  });

  it("handles line 1 (start of file)", () => {
    const result = extractCodeContext(twentyLines, 1);
    const lines = result.split("\n");
    // start = max(0, 1-11) = 0, end = min(20, 1+10) = 11
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe("1 | line 1");
    expect(lines[10]).toBe("11 | line 11");
  });

  it("handles last line of file", () => {
    const result = extractCodeContext(twentyLines, 20);
    const lines = result.split("\n");
    // start = max(0, 20-11) = 9, end = min(20, 20+10) = 20
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe("10 | line 10");
    expect(lines[10]).toBe("20 | line 20");
  });

  it("handles a very short file (fewer lines than the window)", () => {
    const shortFile = "only\ntwo\nlines";
    const result = extractCodeContext(shortFile, 2);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("1 | only");
    expect(lines[1]).toBe("2 | two");
    expect(lines[2]).toBe("3 | lines");
  });

  it("handles a single-line file", () => {
    const result = extractCodeContext("hello world", 1);
    expect(result).toBe("1 | hello world");
  });

  it("handles empty file", () => {
    const result = extractCodeContext("", 1);
    // empty string splits to [""], start=max(0,1-11)=0, end=min(1,1+10)=1 => [""]
    expect(result).toBe("1 | ");
  });

  it("includes line numbers in the output format", () => {
    const result = extractCodeContext("a\nb\nc", 2);
    expect(result).toContain("1 | a");
    expect(result).toContain("2 | b");
    expect(result).toContain("3 | c");
  });
});
