export class UnsafeProjectPathError extends Error {
  readonly code = "unsafe_path";

  constructor(path: string) {
    super(`Unsafe project-relative path: ${path}`);
    this.name = "UnsafeProjectPathError";
  }
}

export function isSafeProjectRelativePath(path: string): boolean {
  if (!path || path !== path.trim() || path.includes("\0") || path.includes("\\")) {
    return false;
  }
  if (path.startsWith("/") || path.startsWith("//") || /^[A-Za-z]:\//.test(path)) {
    return false;
  }
  return path
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function assertSafeProjectRelativePath(path: string): void {
  if (!isSafeProjectRelativePath(path)) {
    throw new UnsafeProjectPathError(path);
  }
}
