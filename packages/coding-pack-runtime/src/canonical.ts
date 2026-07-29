import { CodingPackManifestError } from "./errors.js";

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | CanonicalObject;

export interface CanonicalObject {
  readonly [key: string]: CanonicalValue;
}

const encoder = new TextEncoder();

export function requireWellFormedUnicode(value: string, label: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new CodingPackManifestError(
          "invalid_input",
          `${label} must contain well-formed Unicode.`,
        );
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new CodingPackManifestError(
        "invalid_input",
        `${label} must contain well-formed Unicode.`,
      );
    }
  }
  return value;
}

export function compareUtf8(left: string, right: string): number {
  const leftBytes = encoder.encode(requireWellFormedUnicode(left, "UTF-8 comparison value"));
  const rightBytes = encoder.encode(requireWellFormedUnicode(right, "UTF-8 comparison value"));
  const length = Math.min(leftBytes.byteLength, rightBytes.byteLength);

  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index] - rightBytes[index];
    if (difference !== 0) return difference;
  }

  return leftBytes.byteLength - rightBytes.byteLength;
}

export function canonicalJson(value: CanonicalValue): string {
  if (typeof value === "string") {
    return JSON.stringify(requireWellFormedUnicode(value, "Canonical Coding Pack string"));
  }

  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new CodingPackManifestError(
        "invalid_input",
        "Canonical Coding Pack numbers must be safe integers.",
      );
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => compareUtf8(left, right));
  return `{${entries
    .map(([key, item]) => `${
      JSON.stringify(requireWellFormedUnicode(key, "Canonical Coding Pack key"))
    }:${canonicalJson(item)}`)
    .join(",")}}`;
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new CodingPackManifestError(
      "invalid_input",
      "The Web Crypto SHA-256 API is unavailable.",
    );
  }

  const copiedBytes = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copiedBytes.buffer);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function sha256Canonical(value: CanonicalValue): Promise<string> {
  return sha256Bytes(encoder.encode(canonicalJson(value)));
}
