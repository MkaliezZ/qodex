import { describe, expect, it } from "vitest";
import { parseModelPatchResponse } from "../src/parser/model-output.js";

function envelope(files: unknown[], summary = "Update selected files", version: unknown = "1"): string {
  return `<KERNIQ_PATCH_V1>\n${JSON.stringify({ version, summary, files })}\n</KERNIQ_PATCH_V1>`;
}

const oneFile = {
  path: "src/example.ts",
  oldContent: "export const value = 1;\n",
  newContent: "export const value = 2;\n",
};

describe("KERNIQ_PATCH_V1 model output parser", () => {
  it("parses a valid one-file proposal", () => {
    const result = parseModelPatchResponse(envelope([oneFile]), "task-1");
    expect(result.error).toBeNull();
    expect(result.proposal?.contractVersion).toBe("1");
    expect(result.proposal?.files).toEqual([oneFile]);
  });

  it("parses a valid multi-file proposal", () => {
    const second = { path: "src/other.ts", oldContent: "old", newContent: "new" };
    const result = parseModelPatchResponse(envelope([oneFile, second]), "task-2");
    expect(result.proposal?.files).toHaveLength(2);
  });

  it("separates normal assistant text from the patch envelope", () => {
    const response = `I prepared a safe change.\n\n${envelope([oneFile])}\n\nReview it before applying.`;
    const result = parseModelPatchResponse(response, "task-3");
    expect(result.assistantText).toBe("I prepared a safe change.\n\nReview it before applying.");
    expect(result.assistantText).not.toContain("oldContent");
  });

  it("rejects malformed JSON", () => {
    const result = parseModelPatchResponse("<KERNIQ_PATCH_V1>{bad}</KERNIQ_PATCH_V1>", "task-4");
    expect(result.error?.code).toBe("patch_parse_failed");
    expect(result.proposal).toBeNull();
  });

  it("rejects unsupported versions in the envelope tag", () => {
    const result = parseModelPatchResponse("<KERNIQ_PATCH_V2>{}</KERNIQ_PATCH_V2>", "task-5");
    expect(result.error?.code).toBe("unsupported_patch_version");
  });

  it("rejects unsupported versions in the JSON contract", () => {
    const result = parseModelPatchResponse(envelope([oneFile], "summary", "2"), "task-6");
    expect(result.error?.code).toBe("unsupported_patch_version");
  });

  it("rejects a missing version field", () => {
    const payload = { summary: "Missing version", files: [oneFile] };
    const result = parseModelPatchResponse(
      `<KERNIQ_PATCH_V1>${JSON.stringify(payload)}</KERNIQ_PATCH_V1>`,
      "task-6b",
    );
    expect(result.error?.code).toBe("invalid_patch_shape");
  });

  it("reports a response with no patch envelope", () => {
    const result = parseModelPatchResponse("Explanation only.", "task-7");
    expect(result.error?.code).toBe("patch_not_present");
    expect(result.assistantText).toBe("Explanation only.");
  });

  it("rejects duplicate envelopes", () => {
    const result = parseModelPatchResponse(`${envelope([oneFile])}\n${envelope([oneFile])}`, "task-8");
    expect(result.error?.code).toBe("patch_parse_failed");
  });

  it("rejects duplicate paths", () => {
    const result = parseModelPatchResponse(envelope([oneFile, oneFile]), "task-9");
    expect(result.error?.code).toBe("duplicate_patch_path");
  });

  it.each(["/tmp/outside.ts", "C:/outside.ts", "../outside.ts", "src/../../outside.ts", "src\\file.ts"])(
    "rejects unsafe path %s",
    (path) => {
      const result = parseModelPatchResponse(envelope([{ ...oneFile, path }]), "task-10");
      expect(result.error?.code).toBe("unsafe_path");
    },
  );

  it("rejects unchanged content", () => {
    const result = parseModelPatchResponse(envelope([{ ...oneFile, newContent: oneFile.oldContent }]), "task-11");
    expect(result.error?.code).toBe("invalid_patch_shape");
  });

  it("rejects an empty file list", () => {
    const result = parseModelPatchResponse(envelope([]), "task-12");
    expect(result.error?.code).toBe("invalid_patch_shape");
  });

  it("rejects non-string file content", () => {
    const result = parseModelPatchResponse(envelope([{ ...oneFile, newContent: 42 }]), "task-13");
    expect(result.error?.code).toBe("invalid_patch_shape");
  });

  it("rejects binary file paths", () => {
    const result = parseModelPatchResponse(envelope([{ ...oneFile, path: "assets/icon.png" }]), "task-14");
    expect(result.error?.code).toBe("binary_file_unsupported");
  });
});
