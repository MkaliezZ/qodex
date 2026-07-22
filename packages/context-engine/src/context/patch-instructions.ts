export const PATCH_OUTPUT_INSTRUCTIONS = `=== Patch Output Contract ===
You may explain your reasoning normally in plain text.

When you propose file edits, emit exactly one machine-readable envelope in this format:
<KERNIQ_PATCH_V1>
{
  "version": "1",
  "summary": "Brief description of the proposed changes",
  "files": [
    {
      "path": "project/relative/path.ts",
      "oldContent": "exact complete current file content",
      "newContent": "exact complete replacement file content"
    }
  ]
}
</KERNIQ_PATCH_V1>

Patch rules:
- Paths must be relative to the opened project root.
- oldContent must exactly match the supplied current file content.
- newContent must contain the complete intended replacement file content.
- Only propose changes to files included in Selected Files. Do not create, delete, or edit unseen files.
- Do not claim files were changed before explicit user approval and successful write verification.
- If you cannot safely produce a valid patch, explain why and omit the envelope.
- Do not emit more than one patch envelope.`;
