import { describe, it, expect } from "vitest";
import { parseDiffNameStatus } from "./diff-analyzer.js";

describe("parseDiffNameStatus", () => {
  it("parses added files", () => {
    const result = parseDiffNameStatus("A\tsrc/components/Button.tsx\n");
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe("added");
    expect(result[0]?.path).toBe("src/components/Button.tsx");
  });

  it("parses modified files", () => {
    const result = parseDiffNameStatus("M\tsrc/pages/index.tsx\n");
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe("modified");
  });

  it("parses deleted files", () => {
    const result = parseDiffNameStatus("D\tsrc/old-file.ts\n");
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe("deleted");
  });

  it("parses multiple files", () => {
    const input = "A\tsrc/a.tsx\nM\tsrc/b.tsx\nD\tsrc/c.tsx\n";
    const result = parseDiffNameStatus(input);
    expect(result).toHaveLength(3);
  });

  it("handles empty input", () => {
    expect(parseDiffNameStatus("")).toHaveLength(0);
  });

  it("classifies component files", () => {
    const result = parseDiffNameStatus("A\tsrc/components/Button.tsx\n");
    expect(result[0]?.isComponent).toBe(true);
    expect(result[0]?.isPage).toBe(false);
  });

  it("classifies page files", () => {
    const result = parseDiffNameStatus("M\tsrc/pages/about.tsx\n");
    expect(result[0]?.isPage).toBe(true);
  });

  it("classifies route files", () => {
    const result = parseDiffNameStatus("A\tapp/dashboard/page.tsx\n");
    expect(result[0]?.isRoute).toBe(true);
  });

  it("detects file extension", () => {
    const result = parseDiffNameStatus("A\tsrc/utils/helper.ts\n");
    expect(result[0]?.extension).toBe(".ts");
  });

  it("parses renamed files", () => {
    const result = parseDiffNameStatus("R100\tsrc/old.tsx\tsrc/new.tsx\n");
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe("renamed");
  });

  it("defaults unknown status to modified", () => {
    const result = parseDiffNameStatus("X\tsrc/file.tsx\n");
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe("modified");
  });
});
