import { basename, join, normalize, sep } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
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
}

export interface NativeDirectoryEntry extends NativeFileInfo {
  name: string;
}

export interface TauriProjectBridge {
  pickDirectory(): Promise<string | null>;
  separator(): string;
  basename(path: string): Promise<string>;
  join(...paths: string[]): Promise<string>;
  normalize(path: string): Promise<string>;
  readDirectory(path: string): Promise<NativeDirectoryEntry[]>;
  readTextFile(path: string): Promise<string>;
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
