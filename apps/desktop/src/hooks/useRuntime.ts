import { useState, useEffect, useRef, useCallback } from "react";
import { AgentRuntime } from "@qodex/agent-runtime";
import type { AnyAgentEvent, AgentSession, AgentTask } from "@qodex/agent-runtime";
import { ProjectRuntime, WebFileSystemAdapter } from "@qodex/project-runtime";
import type { ProjectTree, FileContent } from "@qodex/project-runtime";
import { ContextEngine } from "@qodex/context-engine";
import type { ContextBundle } from "@qodex/context-engine";
import { DiffEngine } from "@qodex/diff-engine";
import type { PatchProposal } from "@qodex/diff-engine";
import { useProviderContext } from "../components/ProviderContext";

export function useRuntime() {
  const { config, getProvider, getResolvedModel } = useProviderContext();

  const [runtime, setRuntime] = useState(() => {
    const provider = getProvider();
    if (provider) {
      return new AgentRuntime({
        providers: new Map([[provider.id, provider]]),
        defaultProviderId: provider.id,
        defaultModelId: config.modelId ?? undefined,
      });
    }
    return new AgentRuntime();
  });

  const projectRef = useRef<ProjectRuntime | null>(null);
  const ctxRef = useRef<ContextEngine>(new ContextEngine());
  const diffRef = useRef<DiffEngine>(new DiffEngine());

  const [session, setSession] = useState<AgentSession | null>(null);
  const [currentTask, setCurrentTask] = useState<AgentTask | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [streamedText, setStreamedText] = useState<string>("");

  const [projectName, setProjectName] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<ProjectTree | null>(null);
  const [selectedFileCount, setSelectedFileCount] = useState(0);
  const [selectedFileSize, setSelectedFileSize] = useState(0);
  const [contextFiles, setContextFiles] = useState<FileContent[]>([]);

  const [lastBundle, setLastBundle] = useState<ContextBundle | null>(null);
  const [estimatedTokens, setEstimatedTokens] = useState(0);

  const [pendingProposal, setPendingProposal] = useState<PatchProposal | null>(null);
  const [currentProposal, setCurrentProposal] = useState<PatchProposal | null>(null);

  // Recreate runtime when provider config changes (only when idle)
  useEffect(() => {
    if (isRunning) return;
    const provider = getProvider();
    const newRuntime = provider
      ? new AgentRuntime({
          providers: new Map([[provider.id, provider]]),
          defaultProviderId: provider.id,
          defaultModelId: getResolvedModel() ?? undefined,
        })
      : new AgentRuntime();
    setRuntime(newRuntime);
    setSession(newRuntime.createSession("Qodex Session"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.providerId, config.apiKey, config.modelId, config.manualModelId, config.baseUrl]);

  // Subscribe to events whenever runtime changes
  useEffect(() => {
    const unsub = runtime.subscribe((event: AnyAgentEvent) => {
      switch (event.type) {
        case "task.started":
          setCurrentTask(event.payload.task);
          setIsRunning(true);
          setStreamedText("");
          break;
        case "message.chunk":
          setStreamedText((prev) => prev + event.payload.text);
          break;
        case "task.completed":
          setIsRunning(false);
          setCurrentTask(event.payload.task);
          break;
        case "task.failed":
          setIsRunning(false);
          setStreamedText((prev) => prev + `\n[Error: ${event.payload.error ?? "Unknown error"}]`);
          break;
        case "task.cancelled":
          setIsRunning(false);
          break;
      }
    });
    return () => unsub();
  }, [runtime]);

  const openProject = useCallback(async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      if (!handle) return;
      const adapter = new WebFileSystemAdapter(handle);
      const pr = new ProjectRuntime({ adapter });
      await pr.openProject(handle.name);
      projectRef.current = pr;
      setProjectName(pr.project!.name);
      setFileTree(pr.tree);
      setSelectedFileCount(0);
      setSelectedFileSize(0);
      setContextFiles([]);
      if (pr.index) ctxRef.current.setProjectInfo(pr.project!.name, pr.index);
    } catch (err) {
      console.debug("Open project cancelled:", err);
    }
  }, []);

  const toggleFileSelection = useCallback(async (path: string) => {
    const pr = projectRef.current;
    if (!pr) return;
    pr.toggleSelect(path);
    setFileTree({ ...pr.tree! });
    setSelectedFileCount(pr.selectedPaths.length);
    let totalSize = 0;
    for (const sel of pr.selectedPaths) {
      const entry = pr.index?.files.find((f) => f.path === sel);
      if (entry) totalSize += entry.size;
    }
    setSelectedFileSize(totalSize);
    if (pr.selectedPaths.length > 0) {
      const files = await pr.readSelectedFiles();
      setContextFiles(files);
    } else setContextFiles([]);
  }, []);

  const sendPrompt = useCallback(async (prompt: string) => {
    if (!session || !prompt.trim()) return;
    const bundle = await ctxRef.current.buildContext({ prompt, selectedFiles: contextFiles });
    setLastBundle(bundle);
    setEstimatedTokens(bundle.estimatedTokens);
    const task = runtime.createTask(session.id, bundle.assembledPrompt);
    await runtime.runTask(task.id);

    if (contextFiles.length > 0) {
      setTimeout(async () => {
        const files = await Promise.all(
          contextFiles.map(async (f) => ({
            path: f.path, oldContent: f.content, newContent: `${f.content}\n// Modified by Qodex\n`,
          })),
        );
        const proposal = diffRef.current.createProposal(task.id, `${files.length} file(s) modified`, files);
        setPendingProposal(proposal);
      }, 500);
    }
  }, [session, runtime, contextFiles]);

  const applyProposal = useCallback(async () => {
    if (!pendingProposal) return;
    await diffRef.current.apply(pendingProposal);
    setCurrentProposal(pendingProposal);
    setPendingProposal(null);
  }, [pendingProposal]);

  const rejectProposal = useCallback(() => {
    if (!pendingProposal) return;
    diffRef.current.reject(pendingProposal);
    setPendingProposal(null);
  }, [pendingProposal]);

  return {
    isRunning, currentTask, streamedText, sendPrompt,
    projectName, fileTree, openProject, toggleFileSelection,
    selectedFileCount, selectedFileSize, contextFiles,
    lastBundle, estimatedTokens,
    pendingProposal, currentProposal, applyProposal, rejectProposal,
  };
}
