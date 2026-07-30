import { basename, join, normalize, sep } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { CODING_PACK_PROJECT_SOURCE_MAX_BYTES } from "@qodex/project-runtime";
import {
  exists,
  lstat,
  open as openFile,
  readDir,
  readTextFile,
  stat,
} from "@tauri-apps/plugin-fs";

export interface NativeFileInfo {
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
}

export interface NativeDirectoryEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export class NativeFileSizeLimitError extends Error {
  constructor() {
    super("The native file exceeds its bounded read limit.");
    this.name = "NativeFileSizeLimitError";
  }
}

export interface TauriProjectBridge {
  pickDirectory(): Promise<string | null>;
  separator(): string;
  basename(path: string): Promise<string>;
  join(...paths: string[]): Promise<string>;
  normalize(path: string): Promise<string>;
  readDirectory(path: string): Promise<NativeDirectoryEntry[]>;
  readTextFile(path: string): Promise<string>;
  readFileBytes(path: string, maxBytes: number): Promise<Uint8Array>;
  writeExistingTextFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<NativeFileInfo>;
  lstat(path: string): Promise<NativeFileInfo>;
}

export const tauriProjectBridge: TauriProjectBridge = {
  pickDirectory: async () => {
    return invoke<string | null>("pick_project_directory");
  },
  separator: sep,
  basename,
  join,
  normalize,
  readDirectory: readDir,
  readTextFile,
  readFileBytes: async (path, maxBytes) => {
    if (
      !Number.isSafeInteger(maxBytes)
      || maxBytes < 0
      || maxBytes > CODING_PACK_PROJECT_SOURCE_MAX_BYTES
    ) {
      throw new NativeFileSizeLimitError();
    }
    const file = await openFile(path, { read: true });
    const buffer = new Uint8Array(maxBytes + 1);
    let offset = 0;
    try {
      while (offset < buffer.byteLength) {
        const bytesRead = await file.read(buffer.subarray(offset));
        if (bytesRead === null) break;
        if (bytesRead <= 0) {
          throw new Error("The native file handle returned an invalid byte count.");
        }
        offset += bytesRead;
      }
    } finally {
      await file.close();
    }
    if (offset > maxBytes) throw new NativeFileSizeLimitError();
    return buffer.slice(0, offset);
  },
  writeExistingTextFile: async (path, content) => {
    const file = await openFile(path, { write: true, truncate: true });
    try {
      const data = new TextEncoder().encode(content);
      const written = await file.write(data);
      if (written !== data.byteLength) {
        throw new Error("The native file handle did not write the complete replacement.");
      }
    } finally {
      await file.close();
    }
  },
  exists,
  stat,
  lstat,
};
