/**
 * Qodex Diff Engine — Patch Parser
 *
 * Parses unified diff format strings back into PatchProposal objects.
 * This allows the agent to output patch text and the engine to apply it.
 */

import type { PatchProposal, PatchFile, PatchHunk } from "../models/patch.js";

export class PatchParser {
  /**
   * Parse a unified diff string into a PatchProposal.
   */
  parse(diffText: string, taskId: string, summary?: string): PatchProposal {
    const files = this.extractFiles(diffText);

    return {
      id: crypto.randomUUID(),
      taskId,
      summary: summary ?? `Patch with ${files.length} file(s)`,
      files,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Parse multiple diff blocks into individual PatchProposals.
   */
  parseMulti(diffTexts: string[], taskId: string): PatchProposal[] {
    return diffTexts.map((text, i) =>
      this.parse(text, taskId, `Patch block ${i + 1}`),
    );
  }

  private extractFiles(diffText: string): PatchFile[] {
    const files: PatchFile[] = [];
    const lines = diffText.split("\n");

    let currentPath = "";
    let oldLines: string[] = [];
    let newLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("--- a/") || line.startsWith("+++ b/")) {
        if (line.startsWith("+++ b/")) {
          currentPath = line.slice(6);
        }
        continue;
      }

      if (line.startsWith("diff --git")) {
        // Save previous file
        if (oldLines.length > 0 || newLines.length > 0) {
          // Reconstruct from hunks
        }
        continue;
      }

      if (line.startsWith("@@")) {
        continue;
      }

      if (line.startsWith("+")) {
        newLines.push(line.slice(1));
      } else if (line.startsWith("-")) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith(" ")) {
        oldLines.push(line.slice(1));
        newLines.push(line.slice(1));
      }
    }

    if (currentPath) {
      files.push({
        path: currentPath,
        oldContent: oldLines.join("\n") + "\n",
        newContent: newLines.join("\n") + "\n",
      });
    }

    return files;
  }

  /**
   * Convert a PatchProposal to a unified diff string.
   */
  serialize(proposal: PatchProposal): string {
    const parts: string[] = [];
    parts.push(`# ${proposal.summary}`);
    parts.push(`# Task: ${proposal.taskId}`);
    parts.push("");

    for (const file of proposal.files) {
      parts.push(`--- a/${file.path}`);
      parts.push(`+++ b/${file.path}`);

      const oldLines = file.oldContent.split("\n");
      const newLines = file.newContent.split("\n");
      if (file.oldContent.endsWith("\n")) oldLines.pop();
      if (file.newContent.endsWith("\n")) newLines.pop();

      const maxLen = Math.max(oldLines.length, newLines.length);
      const hdr = `@@ -1,${oldLines.length} +1,${newLines.length} @@`;
      parts.push(hdr);

      // Simple hunk: show all lines with +/- prefix
      for (let i = 0; i < maxLen; i++) {
        if (i < oldLines.length && i < newLines.length && oldLines[i] === newLines[i]) {
          parts.push(` ${oldLines[i]}`);
        } else {
          if (i < oldLines.length) parts.push(`-${oldLines[i]}`);
          if (i < newLines.length) parts.push(`+${newLines[i]}`);
        }
      }

      parts.push("");
    }

    return parts.join("\n");
  }
}
