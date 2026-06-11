/**
 * Qodex Project Runtime — Ignore Rules
 *
 * Determines which files/directories should be excluded from indexing.
 * Mirrors common .gitignore patterns.
 */

const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  "vendor",
  ".cache",
  "__pycache__",
  ".pytest_cache",
  ".venv",
  "env",
  ".env",
  "target",
  "bin",
  "obj",
  ".idea",
  ".vscode",
  ".DS_Store",
]);

const IGNORE_EXTENSIONS = new Set([
  ".lock",
  ".sqlite",
  ".sqlite3",
  ".db",
  ".log",
]);

const IGNORE_PREFIXES = ["."]; // hidden files/dirs

/**
 * Check whether a path should be ignored during indexing.
 */
export function shouldIgnore(entryPath: string): boolean {
  const segments = entryPath.split("/").filter(Boolean);

  for (const seg of segments) {
    // Hidden files/dirs
    if (seg.startsWith(".") && seg !== ".gitignore" && seg !== ".editorconfig") {
      return true;
    }
    // Known ignore dirs
    if (DEFAULT_IGNORE_DIRS.has(seg)) {
      return true;
    }
  }

  // Ignore by extension
  for (const ext of IGNORE_EXTENSIONS) {
    if (entryPath.endsWith(ext)) {
      return true;
    }
  }

  return false;
}

/**
 * Binary file extensions that should not be read as text.
 */
export function isBinaryFile(filename: string): boolean {
  const binaryExtensions = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".pdf",
    ".ico",
    ".svg",
    ".eot",
    ".ttf",
    ".woff",
    ".woff2",
    ".mp3",
    ".mp4",
    ".wav",
    ".mov",
    ".avi",
    ".zip",
    ".tar",
    ".gz",
    ".bz2",
    ".7z",
    ".rar",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".wasm",
  ]);

  const lower = filename.toLowerCase();
  for (const ext of binaryExtensions) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

/** Supported text file extensions mapped to language identifiers */
export function detectLanguage(filename: string): string | undefined {
  const langMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".json": "json",
    ".md": "markdown",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".rs": "rust",
    ".css": "css",
    ".html": "html",
    ".py": "python",
    ".rb": "ruby",
    ".go": "go",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".swift": "swift",
    ".kt": "kotlin",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".dockerfile": "dockerfile",
    ".config": "json",
    ".prisma": "prisma",
    ".graphql": "graphql",
    ".svelte": "svelte",
    ".vue": "vue",
  };

  const lower = filename.toLowerCase();
  for (const [ext, lang] of Object.entries(langMap)) {
    if (lower.endsWith(ext)) return lang;
  }
  return undefined;
}
