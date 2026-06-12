import { describe, it, expect } from "vitest";
import { validateManifest, parseManifest } from "../src/manifest/schema.js";

describe("validateManifest", () => {
  const valid = { id: "react-review", name: "React Review", description: "desc", version: "1.0.0", author: "test", license: "MIT", tags: ["react"], compatibility: { qodex: ">=0.1.0", source: "native" } };

  it("accepts valid manifest", () => { expect(validateManifest(valid).valid).toBe(true); });
  it("rejects missing id", () => { expect(validateManifest({ ...valid, id: undefined }).valid).toBe(false); });
  it("rejects invalid id format", () => { expect(validateManifest({ ...valid, id: "Has Space" }).valid).toBe(false); });
  it("rejects missing version", () => { expect(validateManifest({ ...valid, version: undefined }).valid).toBe(false); });
  it("rejects invalid SemVer", () => { expect(validateManifest({ ...valid, version: "v1" }).valid).toBe(false); });
  it("rejects missing author", () => { expect(validateManifest({ ...valid, author: undefined }).valid).toBe(false); });
  it("rejects missing compatibility", () => { expect(validateManifest({ ...valid, compatibility: undefined }).valid).toBe(false); });
  it("accepts prerelease SemVer", () => { expect(validateManifest({ ...valid, version: "1.0.0-alpha" }).valid).toBe(true); });
  it("truncates tags to 10", () => { const r = validateManifest({ ...valid, tags: ["a","b","c","d","e","f","g","h","i","j","k","l"] }); expect(r.manifest?.tags.length).toBe(10); });
  it("rejects non-object", () => { expect(validateManifest(null).valid).toBe(false); expect(validateManifest("string").valid).toBe(false); });
});

describe("parseManifest", () => {
  it("parses valid JSON manifest", () => {
    const r = parseManifest(JSON.stringify({ id: "test-skill", name: "T", description: "D", version: "1.0.0", author: "a", license: "MIT", tags: [], compatibility: { qodex: ">=0.1.0", source: "native" } }));
    expect(r.valid).toBe(true);
  });
  it("rejects invalid JSON", () => { expect(parseManifest("{invalid}").valid).toBe(false); });
  it("rejects valid JSON with invalid schema", () => { expect(parseManifest('{"id":"bad id"}').valid).toBe(false); });
});
