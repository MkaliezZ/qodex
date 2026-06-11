/**
 * Qodex Project Runtime — Core Runtime
 *
 * Manages project lifecycle: open, close, browse, read.
 * Read-only — no file writing, no patch generation.
 */

import type { Project, ProjectFile, FileContent, ProjectTree, ProjectIndex } from "../types/project.js";
import type { FileSystemAdapter } from "../fs/adapter.js";
import { TreeBuilder } from "../tree/builder.js";
import { FileReader } from "../files/reader.js";
import { ProjectIndexer } from "../indexing/index.js";

export interface ProjectRuntimeOptions {
  adapter: FileSystemAdapter;
  autoIndex?: boolean;
}

export class ProjectRuntime {
  private adapter: FileSystemAdapter;
  private treeBuilder: TreeBuilder | null = null;
  private fileReader: FileReader;
  private indexer: ProjectIndexer;
  private _project: Project | null = null;
  private _tree: ProjectTree | null = null;
  private _index: ProjectIndex | null = null;
  private _selectedFilePaths: string[] = [];

  constructor(options: ProjectRuntimeOptions) {
    this.adapter = options.adapter;
    this.fileReader = new FileReader(this.adapter);
    this.indexer = new ProjectIndexer(this.adapter);
  }

  // ── Project Lifecycle ──────────────────────────────

  async openProject(rootPath: string): Promise<Project> {
    const name = this.adapter.getProjectName(rootPath);
    this._project = {
      id: crypto.randomUUID(),
      name,
      rootPath,
      openedAt: new Date().toISOString(),
    };

    this.treeBuilder = new TreeBuilder(this.adapter, rootPath);
    this._tree = await this.treeBuilder.buildTree();
    this._selectedFilePaths = [];

    // Auto-index
    this._index = await this.indexer.buildIndex(rootPath);

    return this._project;
  }

  closeProject(): void {
    this._project = null;
    this._tree = null;
    this._index = null;
    this._selectedFilePaths = [];
    this.treeBuilder = null;
  }

  get project(): Project | null {
    return this._project;
  }

  get hasProject(): boolean {
    return this._project !== null;
  }

  // ── File Tree ──────────────────────────────────────

  get tree(): ProjectTree | null {
    return this._tree;
  }

  async refreshTree(): Promise<void> {
    if (!this._project || !this.treeBuilder) return;
    this._tree = await this.treeBuilder.buildTree();
  }

  // ── Tree Operations ────────────────────────────────

  expandNode(path: string): boolean {
    if (!this._tree) return false;
    return this.treeBuilder!.expandNode(this._tree.children, path);
  }

  collapseNode(path: string): boolean {
    if (!this._tree) return false;
    return this.treeBuilder!.collapseNode(this._tree.children, path);
  }

  toggleSelect(path: string): boolean {
    if (!this._tree) return false;
    const result = this.treeBuilder!.selectNode(this._tree.children, path);
    if (result) {
      this._selectedFilePaths = this.treeBuilder!.getSelectedPaths(this._tree.children);
    }
    return result;
  }

  get selectedPaths(): string[] {
    return this._selectedFilePaths;
  }

  deselectAll(): void {
    this._selectedFilePaths = [];
  }

  // ── File Reading ───────────────────────────────────

  async readFile(filePath: string): Promise<FileContent> {
    return this.fileReader.readFile(filePath);
  }

  async readFiles(filePaths: string[]): Promise<FileContent[]> {
    return this.fileReader.readFiles(filePaths);
  }

  async readSelectedFiles(): Promise<FileContent[]> {
    return this.fileReader.readFiles(this._selectedFilePaths);
  }

  async readSelectedFilesAsContext(): Promise<string> {
    return this.fileReader.readFilesAsContext(this._selectedFilePaths);
  }

  // ── Index ──────────────────────────────────────────

  get index(): ProjectIndex | null {
    return this._index;
  }

  /** Total file count in the project */
  get fileCount(): number {
    return this._index?.files.length ?? 0;
  }

  /** Total size of all indexed files in bytes */
  get totalSize(): number {
    return this._index?.files.reduce((sum, f) => sum + f.size, 0) ?? 0;
  }
}
