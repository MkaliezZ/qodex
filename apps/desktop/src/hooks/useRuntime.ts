import { useCallback, useEffect, useRef, useState } from "react";
import { AgentRuntime, TaskStatus } from "@qodex/agent-runtime";
import type { AgentSession, AgentTask, AnyAgentEvent } from "@qodex/agent-runtime";
import { ContextEngine } from "@qodex/context-engine";
import type { ContextBundle } from "@qodex/context-engine";
import {
  DiffEngine,
  extractAssistantText,
  parseModelPatchResponse,
} from "@qodex/diff-engine";
import type { ApplyResult, PatchError, PatchProposal } from "@qodex/diff-engine";
import { ProjectRuntime, WebFileSystemAdapter } from "@qodex/project-runtime";
import type { FileContent, ProjectTree } from "@qodex/project-runtime";
import { useProviderContext } from "../components/ProviderContext";

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
}

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
  const ctxRef = useRef(new ContextEngine());
  const diffRef = useRef(new DiffEngine());
  const rawResponseRef = useRef("");

  const [session, setSession] = useState<AgentSession | null>(null);
  const [currentTask, setCurrentTask] = useState<AgentTask | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [streamedText, setStreamedText] = useState("");

  const [projectName, setProjectName] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<ProjectTree | null>(null);
  const [selectedFileCount, setSelectedFileCount] = useState(0);
  const [selectedFileSize, setSelectedFileSize] = useState(0);
  const [contextFiles, setContextFiles] = useState<FileContent[]>([]);

  const [lastBundle, setLastBundle] = useState<ContextBundle | null>(null);
  const [estimatedTokens, setEstimatedTokens] = useState(0);

  const [pendingProposal, setPendingProposal] = useState<PatchProposal | null>(null);
  const [currentProposal, setCurrentProposal] = useState<PatchProposal | null>(null);
  const [patchErrors, setPatchErrors] = useState<PatchError[]>([]);
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);
  const [rollbackResults, setRollbackResults] = useState<ApplyResult[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

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
    setSession(newRuntime.createSession("KerniQ Session"));
    // Provider callbacks intentionally follow the primitive config fields below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.providerId, config.apiKey, config.modelId, config.manualModelId, config.baseUrl]);

  useEffect(() => {
    const unsubscribe = runtime.subscribe((event: AnyAgentEvent) => {
      switch (event.type) {
        case "task.started":
          rawResponseRef.current = "";
          setCurrentTask(event.payload.task);
          setIsRunning(true);
          setStreamedText("");
          break;
        case "message.chunk":
          rawResponseRef.current += event.payload.text;
          setStreamedText(extractAssistantText(rawResponseRef.current));
          break;
        case "task.completed":
          setIsRunning(false);
          setCurrentTask(event.payload.task);
          break;
        case "task.failed":
          setIsRunning(false);
          setPatchErrors([{
            code: "provider_failed",
            message: "The configured provider failed to complete the request.",
          }]);
          setStreamedText((previous) => previous || "The model request failed before a patch was produced.");
          break;
        case "task.cancelled":
          setIsRunning(false);
          break;
      }
    });
    return unsubscribe;
  }, [runtime]);

  const refreshSelectedFiles = useCallback(async () => {
    const project = projectRef.current;
    if (!project || project.selectedPaths.length === 0) {
      setContextFiles([]);
      return;
    }
    setContextFiles(await project.readSelectedFiles());
  }, []);

  const openProject = useCallback(async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      setPatchErrors([{
        code: "write_target_unavailable",
        message: "This environment does not provide local directory access.",
      }]);
      return;
    }

    try {
      const handle = await picker.call(window, { mode: "readwrite" });
      const adapter = new WebFileSystemAdapter(handle);
      const project = new ProjectRuntime({ adapter });
      await project.openProject(handle.name);
      projectRef.current = project;
      diffRef.current = new DiffEngine(project.fileAccess, project.fileAccess);
      setProjectName(project.project?.name ?? handle.name);
      setFileTree(project.tree);
      setSelectedFileCount(0);
      setSelectedFileSize(0);
      setContextFiles([]);
      setPendingProposal(null);
      setCurrentProposal(null);
      setPatchErrors([]);
      setApplyResults([]);
      setRollbackResults([]);
      if (project.index) ctxRef.current.setProjectInfo(project.project?.name ?? handle.name, project.index);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPatchErrors([{
        code: "file_not_found",
        message: error instanceof Error ? error.message : "Unable to open the selected project.",
      }]);
    }
  }, []);

  const toggleFileSelection = useCallback(async (path: string) => {
    const project = projectRef.current;
    if (!project) return;
    project.toggleSelect(path);
    setFileTree(project.tree ? { ...project.tree } : null);
    setSelectedFileCount(project.selectedPaths.length);
    let totalSize = 0;
    for (const selectedPath of project.selectedPaths) {
      const entry = project.index?.files.find((file) => file.path === selectedPath);
      if (entry) totalSize += entry.size;
    }
    setSelectedFileSize(totalSize);
    await refreshSelectedFiles();
  }, [refreshSelectedFiles]);

  const sendPrompt = useCallback(async (prompt: string) => {
    if (!session || !prompt.trim()) return;

    setPendingProposal(null);
    setPatchErrors([]);
    setApplyResults([]);
    setRollbackResults([]);

    const bundle = await ctxRef.current.buildContext({ prompt, selectedFiles: contextFiles });
    setLastBundle(bundle);
    setEstimatedTokens(bundle.estimatedTokens);

    const task = runtime.createTask(session.id, bundle.assembledPrompt);
    await runtime.runTask(task.id);
    const completedTask = runtime.getTask(task.id);
    if (!completedTask || completedTask.status !== TaskStatus.Done) return;

    const parsed = parseModelPatchResponse(completedTask.output, task.id);
    setStreamedText(parsed.assistantText);
    if (!parsed.proposal) {
      setPatchErrors(parsed.error ? [parsed.error] : []);
      return;
    }

    const selectedPaths = new Set(contextFiles.map((file) => file.path));
    const unseenFile = parsed.proposal.files.find((file) => !selectedPaths.has(file.path));
    if (unseenFile) {
      setPatchErrors([{
        code: "invalid_patch_shape",
        path: unseenFile.path,
        message: `The model proposed a file that was not selected: ${unseenFile.path}`,
      }]);
      return;
    }

    const conflicts = await diffRef.current.validateProposal(parsed.proposal);
    if (conflicts.length > 0) {
      setPatchErrors(conflicts.map((conflict) => ({
        code: conflict.type === "line_mismatch" ? "content_mismatch" : conflict.type,
        path: conflict.path,
        message: conflict.detail,
      })));
      return;
    }

    setPatchErrors([]);
    setPendingProposal(parsed.proposal);
  }, [contextFiles, runtime, session]);

  const applyProposal = useCallback(async () => {
    if (!pendingProposal || isApplying) return;
    setIsApplying(true);
    setPatchErrors([]);
    try {
      const results = await diffRef.current.apply(pendingProposal);
      setApplyResults(results);
      if (results.length === pendingProposal.files.length && results.every((result) => result.success)) {
        setCurrentProposal(pendingProposal);
        setPendingProposal(null);
        await refreshSelectedFiles();
        return;
      }

      setPatchErrors(results.filter((result) => !result.success).map((result) => ({
        code: result.code ?? "write_failed",
        path: result.path,
        message: result.error ?? "The patch could not be applied.",
      })));
    } finally {
      setIsApplying(false);
    }
  }, [isApplying, pendingProposal, refreshSelectedFiles]);

  const rejectProposal = useCallback(() => {
    if (!pendingProposal) return;
    diffRef.current.reject(pendingProposal);
    setPendingProposal(null);
    setPatchErrors([]);
    setApplyResults([]);
  }, [pendingProposal]);

  const rollbackProposal = useCallback(async () => {
    if (!currentProposal || isRollingBack) return;
    setIsRollingBack(true);
    setPatchErrors([]);
    try {
      const results = await diffRef.current.rollback(currentProposal);
      setRollbackResults(results);
      if (results.length === currentProposal.files.length && results.every((result) => result.success)) {
        setCurrentProposal(null);
        setApplyResults([]);
        await refreshSelectedFiles();
        return;
      }

      setPatchErrors(results.filter((result) => !result.success).map((result) => ({
        code: result.code ?? "rollback_failed",
        path: result.path,
        message: result.error ?? "Rollback failed.",
      })));
    } finally {
      setIsRollingBack(false);
    }
  }, [currentProposal, isRollingBack, refreshSelectedFiles]);

  return {
    isRunning,
    currentTask,
    streamedText,
    sendPrompt,
    projectName,
    fileTree,
    openProject,
    toggleFileSelection,
    selectedFileCount,
    selectedFileSize,
    contextFiles,
    lastBundle,
    estimatedTokens,
    pendingProposal,
    currentProposal,
    patchErrors,
    applyResults,
    rollbackResults,
    isApplying,
    isRollingBack,
    applyProposal,
    rejectProposal,
    rollbackProposal,
  };
}
