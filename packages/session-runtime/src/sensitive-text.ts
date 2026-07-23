import type { SafeJson } from "./types.js";

export type SensitiveTextKind = "credential" | "absolute_path";

export interface SensitiveTextScan {
  hasSensitiveText: boolean;
  hasCredential: boolean;
  hasAbsolutePath: boolean;
  kinds: SensitiveTextKind[];
}

interface SensitiveRule {
  kind: SensitiveTextKind;
  source: string;
  flags: string;
  replacement: string;
}

const RULES: SensitiveRule[] = [
  {
    kind: "credential",
    source: "-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\\s\\S]{0,65536}?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----",
    flags: "gi",
    replacement: "[redacted-private-key]",
  },
  {
    kind: "credential",
    source: "\\b(Authorization\\s*:)(?!\\s*\\[redacted-secret\\])\\s*[^\\r\\n]{1,4096}",
    flags: "gi",
    replacement: "$1 [redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\b((?:Set-)?Cookie\\s*:)(?!\\s*\\[redacted-secret\\])\\s*[^\\r\\n]{1,4096}",
    flags: "gi",
    replacement: "$1 [redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\bBearer\\s+[A-Za-z0-9._~+/=-]{8,2048}",
    flags: "gi",
    replacement: "Bearer [redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\bsk-(?:proj-)?[A-Za-z0-9_-]{12,200}",
    flags: "gi",
    replacement: "[redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\bgithub_pat_[A-Za-z0-9_]{20,255}",
    flags: "g",
    replacement: "[redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\bgh[pousr]_[A-Za-z0-9]{20,255}",
    flags: "g",
    replacement: "[redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\b(?:AKIA|ASIA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[A-Z0-9]{16}\\b",
    flags: "g",
    replacement: "[redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\b((?:AWS_)?SECRET_ACCESS_KEY\\s*[:=]\\s*)(?:\\\"[^\\\"\\r\\n]{4,2048}\\\"|'[^'\\r\\n]{4,2048}'|[^\\s,;]{4,2048})",
    flags: "gi",
    replacement: "$1[redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\bxox[baprs]-[A-Za-z0-9-]{10,250}",
    flags: "gi",
    replacement: "[redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\bAIza[0-9A-Za-z_-]{35}\\b",
    flags: "g",
    replacement: "[redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\b((?:api[_-]?key|access[_-]?token|auth[_-]?token|token|client[_-]?secret|secret|password)\\s*[:=]\\s*)(?:\\\"[^\\\"\\r\\n]{8,2048}\\\"|'[^'\\r\\n]{8,2048}')",
    flags: "gi",
    replacement: "$1[redacted-secret]",
  },
  {
    kind: "credential",
    source: "\\b((?:api[_-]?key|access[_-]?token|auth[_-]?token|token|client[_-]?secret|secret|password)\\s*[:=]\\s*)(?=[^\\s,;]{12,2048})(?=[^\\s,;]*\\d)[A-Za-z0-9_./+=-]{12,2048}",
    flags: "gi",
    replacement: "$1[redacted-secret]",
  },
  {
    kind: "absolute_path",
    source: "\\bfile://[^\\s\\\"'<>)]{1,2048}",
    flags: "gi",
    replacement: "[redacted-path]",
  },
  {
    kind: "absolute_path",
    source: "\\\\\\\\[A-Za-z0-9._$-]+\\\\[^\\s\\\"'<>|]{1,2048}",
    flags: "g",
    replacement: "[redacted-path]",
  },
  {
    kind: "absolute_path",
    source: "\\b[A-Za-z]:[\\\\/][^\\s\\\"'<>|]{1,2048}",
    flags: "g",
    replacement: "[redacted-path]",
  },
  {
    kind: "absolute_path",
    source: "(?<![A-Za-z0-9:])/(?:Users|home|root|tmp|var|etc|opt|private|Volumes|Library|usr|srv|mnt|media|workspace|workspaces)/[^\\s\\\"'<>)]{1,2048}",
    flags: "g",
    replacement: "[redacted-path]",
  },
];

const SENSITIVE_FIELD = /^(?:api.?key|authorization|authorization.?header|cookie|cookies|credential|credential.?id|secret|secret.?value|token|access.?token|auth.?token|client.?secret|password|private.?key|aws.?secret.?access.?key|aws.?session.?token|headers?|raw.?environment|environment.?variables|env)$/i;

export function inspectSensitiveText(value: string): SensitiveTextScan {
  let hasCredential = false;
  let hasAbsolutePath = false;
  for (const rule of RULES) {
    if (!new RegExp(rule.source, rule.flags.replace("g", "")).test(value)) continue;
    if (rule.kind === "credential") hasCredential = true;
    if (rule.kind === "absolute_path") hasAbsolutePath = true;
  }
  const kinds: SensitiveTextKind[] = [];
  if (hasCredential) kinds.push("credential");
  if (hasAbsolutePath) kinds.push("absolute_path");
  return {
    hasSensitiveText: hasCredential || hasAbsolutePath,
    hasCredential,
    hasAbsolutePath,
    kinds,
  };
}

export function sanitizeSensitiveText(value: string): string {
  return RULES.reduce(
    (sanitized, rule) => sanitized.replace(new RegExp(rule.source, rule.flags), rule.replacement),
    value,
  );
}

export function sanitizeSensitiveJson(value: SafeJson): SafeJson {
  if (typeof value === "string") return sanitizeSensitiveText(value);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sanitizeSensitiveJson);
  const sanitized: Record<string, SafeJson> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveFieldName(key)) continue;
    sanitized[key] = sanitizeSensitiveJson(child);
  }
  return sanitized;
}

export function isSensitiveFieldName(value: string): boolean {
  return SENSITIVE_FIELD.test(value);
}
