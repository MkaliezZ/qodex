/**
 * Qodex Context Engine — File Context Builder
 *
 * Transforms FileContent[] into a formatted file context block.
 * Preserves order, filenames, and content. No chunking or ranking.
 */

import type { FileContent } from "@qodex/project-runtime";

export class FileContextBuilder {
  /**
   * Build a formatted file context block from selected files.
   *
   * Output format:
   * ```
   * === FILE ===
   * path/to/file.ts (typescript)
   * --- content ---
   * ...
   *
   * === FILE ===
   * ...
   * ```
   */
  build(files: FileContent[]): string {
    if (files.length === 0) return "";

    const blocks: string[] = [];

    for (const file of files) {
      if (file.content === "Unsupported Binary File") continue;

      const lang = file.language ? ` (${file.language})` : "";
      blocks.push([
        `=== FILE ===`,
        `${file.path}${lang}`,
        `--- content ---`,
        file.content,
      ].join("\n"));
    }

    return blocks.join("\n\n");
  }

  /**
   * Get the count of valid (non-binary) files.
   */
  validFileCount(files: FileContent[]): number {
    return files.filter((f) => f.content !== "Unsupported Binary File").length;
  }
}
