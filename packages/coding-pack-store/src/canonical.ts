import { CodingPackStoreError } from "./errors.js";

export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

const encoder = new TextEncoder();

export function requireWellFormedUnicode(value: string, label: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) canonicalError(label);
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      canonicalError(label);
    }
  }
  return value;
}

export function utf8ByteLength(value: string, label: string): number {
  return encoder.encode(requireWellFormedUnicode(value, label)).byteLength;
}

export function compareUtf8(left: string, right: string): number {
  const leftBytes = encoder.encode(requireWellFormedUnicode(left, "Canonical key"));
  const rightBytes = encoder.encode(requireWellFormedUnicode(right, "Canonical key"));
  const length = Math.min(leftBytes.byteLength, rightBytes.byteLength);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index] - rightBytes[index];
    if (difference !== 0) return difference;
  }
  return leftBytes.byteLength - rightBytes.byteLength;
}

export function canonicalJson(value: CanonicalValue): string {
  if (typeof value === "string") {
    return JSON.stringify(requireWellFormedUnicode(value, "Canonical string"));
  }
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) canonicalError("Canonical number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (
    typeof value !== "object"
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    canonicalError("Canonical value");
  }
  const entries = Object.entries(value).sort(([left], [right]) => compareUtf8(left, right));
  return `{${entries.map(([key, item]) => (
    `${
      JSON.stringify(requireWellFormedUnicode(key, "Canonical key"))
    }:${canonicalJson(item)}`
  )).join(",")}}`;
}

export async function sha256Canonical(value: CanonicalValue): Promise<string> {
  const bytes = encoder.encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function sha256Text(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(requireWellFormedUnicode(value, "SHA-256 input")),
  );
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function canonicalError(_label: string): never {
  throw new CodingPackStoreError("coding_pack_proposal_invalid");
}
