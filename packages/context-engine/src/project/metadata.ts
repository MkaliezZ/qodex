/**
 * Qodex Context Engine — Project Metadata Builder
 *
 * Generates a compact project metadata summary for the context.
 * No repository map yet — just basic stats.
 */

import type { ProjectIndex } from "@qodex/project-runtime";

export interface ProjectInfo {
  name: string;
  fileCount: number;
  totalSize: number;
  selectedFileCount: number;
  languages: string[];
}

export class ProjectMetadataBuilder {
  /**
   * Build a compact metadata string from project info.
   */
  build(info: ProjectInfo): string {
    const lines: string[] = [];
    lines.push(`Project: ${info.name}`);
    lines.push(`Files Indexed: ${info.fileCount}`);
    lines.push(`Selected Files: ${info.selectedFileCount}`);

    if (info.languages.length > 0) {
      lines.push("");
      lines.push("Languages:");
      for (const lang of info.languages) {
        lines.push(`- ${lang}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Build metadata from a ProjectIndex instance.
   */
  buildFromIndex(
    name: string,
    index: ProjectIndex,
    selectedCount: number,
  ): string {
    const languages = new Set<string>();
    for (const file of index.files) {
      if (file.language) languages.add(file.language);
    }

    return this.build({
      name,
      fileCount: index.files.length,
      totalSize: index.files.reduce((s, f) => s + f.size, 0),
      selectedFileCount: selectedCount,
      languages: Array.from(languages).sort(),
    });
  }
}
