import {
  CODING_PACK_PROJECT_SOURCE_MAX_BYTES,
  CodingPackProjectSourceError,
  assertSafeProjectRelativePath,
  detectLanguage,
  isBinaryFile,
  shouldIgnore,
} from "@qodex/project-runtime";
import type { FileSystemAdapter, ProjectFile } from "@qodex/project-runtime";
import {
  NativeFileSizeLimitError,
  type NativeFileInfo,
  type TauriProjectBridge,
} from "./tauriBridge";
import { ProjectAccessError } from "./types";

function pathComponents(path: string, windows: boolean): string[] {
  const components = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return windows ? components.map((component) => component.toLocaleLowerCase("en-US")) : components;
}

function isContainedPath(root: string, candidate: string, separator: string): boolean {
  const windows = separator === "\\";
  const rootComponents = pathComponents(root, windows);
  const candidateComponents = pathComponents(candidate, windows);
  return candidateComponents.length >= rootComponents.length
    && rootComponents.every((component, index) => candidateComponents[index] === component);
}

function safeError(code: ProjectAccessError["code"], message: string): ProjectAccessError {
  return new ProjectAccessError(code, message);
}

export class TauriFileSystemAdapter implements FileSystemAdapter {
  private constructor(
    private readonly root: string,
    private readonly projectName: string,
    private readonly bridge: TauriProjectBridge,
  ) {}

  static async create(root: string, bridge: TauriProjectBridge): Promise<TauriFileSystemAdapter> {
    try {
      const normalizedRoot = await bridge.normalize(root);
      const name = await bridge.basename(normalizedRoot);
      const rootInfo = await bridge.lstat(normalizedRoot);
      if (!name || !rootInfo.isDirectory || rootInfo.isSymlink) {
        throw safeError("unsafe_path", "The selected project root is not a regular directory.");
      }
      return new TauriFileSystemAdapter(normalizedRoot, name, bridge);
    } catch (error) {
      if (error instanceof ProjectAccessError) throw error;
      throw safeError("file_not_found", "KerniQ could not open the selected project directory.");
    }
  }

  async listDirectory(dirPath: string): Promise<ProjectFile[]> {
    const resolved = await this.resolvePath(dirPath, true);
    await this.assertDirectory(resolved.absolutePath, resolved.segments);

    try {
      const entries = await this.bridge.readDirectory(resolved.absolutePath);
      const projectFiles: ProjectFile[] = [];
      for (const entry of entries) {
        if (entry.isSymlink || (!entry.isDirectory && !entry.isFile)) continue;
        const path = dirPath ? `${dirPath}/${entry.name}` : entry.name;
        if (shouldIgnore(path)) continue;
        projectFiles.push({
          path,
          name: entry.name,
          type: entry.isDirectory ? "directory" : "file",
          language: entry.isFile ? detectLanguage(entry.name) : undefined,
        });
      }
      return projectFiles.sort((left, right) => {
        if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
    } catch (error) {
      if (error instanceof ProjectAccessError) throw error;
      throw safeError("file_not_found", "KerniQ could not read the selected project directory.");
    }
  }

  async readTextFile(filePath: string): Promise<string> {
    this.assertTextPath(filePath);
    const resolved = await this.resolvePath(filePath);
    await this.assertRegularFile(resolved.absolutePath, resolved.segments);
    try {
      return await this.bridge.readTextFile(resolved.absolutePath);
    } catch {
      throw safeError("file_not_found", "KerniQ could not read the selected project file.");
    }
  }

  async readFileBytes(filePath: string): Promise<Uint8Array> {
    let resolved: { absolutePath: string; segments: string[] };
    let info: NativeFileInfo;
    try {
      resolved = await this.resolvePath(filePath);
      info = await this.assertRegularFile(resolved.absolutePath, resolved.segments);
    } catch {
      throw new CodingPackProjectSourceError(
        "coding_pack_read_failed",
        "KerniQ could not read the selected project file.",
      );
    }

    if (
      !Number.isSafeInteger(info.size)
      || info.size < 0
      || info.size > CODING_PACK_PROJECT_SOURCE_MAX_BYTES
    ) {
      throw new CodingPackProjectSourceError(
        "coding_pack_source_too_large",
        "The selected project file exceeds the Coding Pack preview limit.",
      );
    }

    try {
      const bytes = await this.bridge.readFileBytes(
        resolved.absolutePath,
        CODING_PACK_PROJECT_SOURCE_MAX_BYTES,
      );
      if (bytes.byteLength > CODING_PACK_PROJECT_SOURCE_MAX_BYTES) {
        throw new NativeFileSizeLimitError();
      }
      return bytes;
    } catch (error) {
      if (error instanceof NativeFileSizeLimitError) {
        throw new CodingPackProjectSourceError(
          "coding_pack_source_too_large",
          "The selected project file exceeds the Coding Pack preview limit.",
        );
      }
      throw new CodingPackProjectSourceError(
        "coding_pack_read_failed",
        "KerniQ could not read the selected project file.",
      );
    }
  }

  async readTextFiles(filePaths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    for (const path of filePaths) {
      try {
        results.set(path, await this.readTextFile(path));
      } catch {
        // Match the browser adapter: unreadable files are omitted from bulk reads.
      }
    }
    return results;
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    this.assertTextPath(filePath);
    const resolved = await this.resolvePath(filePath);
    await this.assertRegularFile(resolved.absolutePath, resolved.segments);
    try {
      await this.bridge.writeExistingTextFile(resolved.absolutePath, content);
    } catch {
      throw safeError("write_failed", "KerniQ could not replace the selected project file.");
    }
  }

  async exists(path: string): Promise<boolean> {
    const resolved = await this.resolvePath(path);
    try {
      if (!await this.bridge.exists(resolved.absolutePath)) return false;
      await this.assertNoSymlinks(resolved.segments);
      return true;
    } catch (error) {
      if (error instanceof ProjectAccessError) throw error;
      return false;
    }
  }

  getProjectName(_rootPath: string): string {
    return this.projectName;
  }

  private assertTextPath(path: string): void {
    try {
      assertSafeProjectRelativePath(path);
    } catch {
      throw safeError("unsafe_path", "The project file path is not a safe relative path.");
    }
    if (isBinaryFile(path)) {
      throw safeError("binary_file_unsupported", "Binary project files cannot be modified.");
    }
  }

  private async resolvePath(
    relativePath: string,
    allowRoot = false,
  ): Promise<{ absolutePath: string; segments: string[] }> {
    if (!relativePath && allowRoot) return { absolutePath: this.root, segments: [] };
    try {
      assertSafeProjectRelativePath(relativePath);
    } catch {
      throw safeError("unsafe_path", "The project path is not a safe relative path.");
    }

    const segments = relativePath.split("/");
    try {
      const absolutePath = await this.bridge.normalize(await this.bridge.join(this.root, ...segments));
      if (!isContainedPath(this.root, absolutePath, this.bridge.separator())) {
        throw safeError("unsafe_path", "The project path resolves outside the selected directory.");
      }
      return { absolutePath, segments };
    } catch (error) {
      if (error instanceof ProjectAccessError) throw error;
      throw safeError("unsafe_path", "The project path could not be resolved safely.");
    }
  }

  private async assertNoSymlinks(segments: string[]): Promise<void> {
    let current = this.root;
    for (const segment of segments) {
      try {
        current = await this.bridge.normalize(await this.bridge.join(current, segment));
        const info = await this.bridge.lstat(current);
        if (info.isSymlink) {
          throw safeError("unsafe_path", "Symbolic links and junctions are not traversed.");
        }
      } catch (error) {
        if (error instanceof ProjectAccessError) throw error;
        throw safeError("file_not_found", "The requested project path does not exist.");
      }
    }
  }

  private async assertRegularFile(
    absolutePath: string,
    segments: string[],
  ): Promise<NativeFileInfo> {
    await this.assertNoSymlinks(segments);
    const info = await this.readMetadata(absolutePath);
    if (!info.isFile || info.isDirectory || info.isSymlink) {
      throw safeError("file_not_found", "The requested project path is not a regular file.");
    }
    return info;
  }

  private async assertDirectory(absolutePath: string, segments: string[]): Promise<void> {
    await this.assertNoSymlinks(segments);
    const info = await this.readMetadata(absolutePath);
    if (!info.isDirectory || info.isFile || info.isSymlink) {
      throw safeError("file_not_found", "The requested project path is not a directory.");
    }
  }

  private async readMetadata(absolutePath: string): Promise<NativeFileInfo> {
    try {
      return await this.bridge.stat(absolutePath);
    } catch {
      throw safeError("file_not_found", "The requested project path does not exist.");
    }
  }
}
