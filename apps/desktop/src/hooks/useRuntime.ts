import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentLoopRuntime,
  AgentRuntime,
  TaskStatus,
} from "@qodex/agent-runtime";
import type {
  AgentLoopTask,
  AgentPatchAdapter,
  AgentPatchProposal,
  AgentProjectAccess,
  AgentSession,
  AgentTask,
  AnyAgentEvent,
  ProjectCommandRunner,
} from "@qodex/agent-runtime";
import { ContextEngine } from "@qodex/context-engine";
import type { ContextBundle } from "@qodex/context-engine";
import {
  DiffEngine,
  extractAssistantText,
  parseModelPatchResponse,
} from "@qodex/diff-engine";
import type { ApplyResult, PatchError, PatchProposal } from "@qodex/diff-engine";
import { ProjectRuntime } from "@qodex/project-runtime";
import type { FileContent, ProjectTree } from "@qodex/project-runtime";
import type { ModelProvider } from "@qodex/provider-sdk";
import type { AgentFuseBridgeClient } from "@qodex/agentfuse-adapter";
import {
  CodingPackAgentFuseAdapter,
  evaluateCodingPackExportPolicy,
  type CodingPackAgentFuseBridgeClient,
} from "@qodex/coding-pack-agentfuse";
import type { CodingPackPurpose } from "@qodex/coding-pack-runtime";
import {
  CodingPackStoreError,
  type CodingPackDestinationBinding,
  type CodingPackOperationSnapshot,
  type CodingPackStoreErrorCode,
} from "@qodex/coding-pack-store";
import { useProviderContext } from "../components/ProviderContext";
import { useSessionContext } from "../components/SessionContext";
import {
  CodingPackPreviewError,
  codingPackSelectionRulesVersion,
  confirmCodingPackPreview,
  createSelectedFileCodingPackPreview,
  digestSelectedPaths,
  isCodingPackPreviewStale,
  verifyCodingPackPreviewConfirmation,
  type CodingPackPreview,
  type CodingPackPreviewConfirmation,
  type CodingPackPreviewErrorCode,
} from "../codingPack/preview";
import { openProjectDirectory } from "../platform/openProjectDirectory";
import {
  chooseCodingPackDestination,
  createCodingPackDestinationCapabilityVerifier,
  hasCodingPackDestinationCapability,
} from "../platform/codingPackDestination";
import {
  createVerifiedCodingPackExportProposal,
  getCodingPackStore,
} from "../platform/codingPackStore";
import { createManagedPythonBridge } from "../platform/managedPythonBridge";
import { projectBindingIdentity, type OpenProjectBindingIdentity } from "../platform/projectBinding";
import { ProjectAccessError, type ProjectAccessSource } from "../platform/types";
import { AgentSessionLedgerRecorder } from "../session/agentSessionRecorder";
import {
  createProjectCommandAgentFuseAdapter,
} from "../session/projectCommandDecisionCoordinator";
import {
  discardedProposalNotice,
  getAgentPendingProposal,
  resolveProposalActionRoute,
  type ProposalOrigin,
} from "./proposalOwnership";

const ACTIVE_AGENT_STATES = new Set([
  "Planning",
  "CallingModel",
  "Streaming",
  "ExecutingReadTool",
  "WaitingForPatchApproval",
  "ApplyingPatch",
  "WaitingForCommandApproval",
  "RunningCommand",
  "Cancelling",
  "ReturningToolResult",
]);

export function useRuntime() {
  const { config, getProvider, getResolvedModel } = useProviderContext();
  const { runtime: sessionRuntime, refreshSessions } = useSessionContext();
  const [runtime, setRuntime] = useState(() => createSingleTurnRuntime(getProvider(), config.modelId));

  const projectRef = useRef<ProjectRuntime | null>(null);
  const commandRunnerRef = useRef<ProjectCommandRunner | null>(null);
  const agentLoopRef = useRef<AgentLoopRuntime | null>(null);
  const agentUnsubscribeRef = useRef<(() => void) | null>(null);
  const agentSessionRecorderRef = useRef<AgentSessionLedgerRecorder | null>(null);
  const projectBindingRef = useRef<OpenProjectBindingIdentity | null>(null);
  const projectGenerationRef = useRef(0);
  const selectedPathsRevisionRef = useRef(0);
  const codingPackPurposeRef = useRef<CodingPackPurpose>("repository_orientation");
  const codingPackStoreRef = useRef(getCodingPackStore());
  const ctxRef = useRef(new ContextEngine());
  const diffRef = useRef(new DiffEngine());
  const rawResponseRef = useRef("");
  const pendingProposalRef = useRef<PatchProposal | null>(null);
  const proposalOriginRef = useRef<ProposalOrigin | null>(null);

  const [session, setSession] = useState<AgentSession | null>(null);
  const [currentTask, setCurrentTask] = useState<AgentTask | null>(null);
  const [agentTask, setAgentTask] = useState<AgentLoopTask | null>(null);
  const [agentModeNotice, setAgentModeNotice] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [streamedText, setStreamedText] = useState("");

  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectSource, setProjectSource] = useState<ProjectAccessSource | null>(null);
  const [fileTree, setFileTree] = useState<ProjectTree | null>(null);
  const [selectedFileCount, setSelectedFileCount] = useState(0);
  const [selectedFileSize, setSelectedFileSize] = useState(0);
  const [contextFiles, setContextFiles] = useState<FileContent[]>([]);
  const [projectBindingId, setProjectBindingId] = useState<string | null>(null);
  const [projectGeneration, setProjectGeneration] = useState(0);
  const [selectedPathsDigest, setSelectedPathsDigest] = useState<string | null>(null);
  const [codingPackPurpose, setCodingPackPurposeState] =
    useState<CodingPackPurpose>("repository_orientation");
  const [codingPackPreview, setCodingPackPreview] = useState<CodingPackPreview | null>(null);
  const [codingPackConfirmation, setCodingPackConfirmation] =
    useState<CodingPackPreviewConfirmation | null>(null);
  const [codingPackPreviewError, setCodingPackPreviewError] =
    useState<CodingPackPreviewErrorCode | null>(null);
  const [isCodingPackPreviewLoading, setIsCodingPackPreviewLoading] = useState(false);
  const [codingPackDestination, setCodingPackDestination] =
    useState<CodingPackDestinationBinding | null>(null);
  const [codingPackOperation, setCodingPackOperation] =
    useState<CodingPackOperationSnapshot | null>(null);
  const [codingPackRecoveredOperation, setCodingPackRecoveredOperation] =
    useState<CodingPackOperationSnapshot | null>(null);
  const [codingPackStoreError, setCodingPackStoreError] =
    useState<CodingPackStoreErrorCode | null>(null);
  const [isCodingPackExportLoading, setIsCodingPackExportLoading] = useState(false);

  const [lastBundle, setLastBundle] = useState<ContextBundle | null>(null);
  const [estimatedTokens, setEstimatedTokens] = useState(0);

  const [pendingProposal, setPendingProposal] = useState<PatchProposal | null>(null);
  const [proposalOrigin, setProposalOrigin] = useState<ProposalOrigin | null>(null);
  const [proposalNotice, setProposalNotice] = useState<string | null>(null);
  const [currentProposal, setCurrentProposal] = useState<PatchProposal | null>(null);
  const [patchErrors, setPatchErrors] = useState<PatchError[]>([]);
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);
  const [rollbackResults, setRollbackResults] = useState<ApplyResult[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [agentRollbackAvailable, setAgentRollbackAvailable] = useState(false);
  const [agentRollbackReason, setAgentRollbackReason] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void codingPackStoreRef.current.listCodingPackOperations()
      .then((operations) => {
        if (active) setCodingPackRecoveredOperation(operations[0] ?? null);
      })
      .catch((error) => {
        if (active) setCodingPackStoreError(codingPackStoreErrorCode(
          error,
          "coding_pack_store_unavailable",
        ));
      });
    return () => { active = false; };
  }, []);

  const setProposalState = useCallback((proposal: PatchProposal | null, origin: ProposalOrigin | null) => {
    pendingProposalRef.current = proposal;
    proposalOriginRef.current = origin;
    setPendingProposal(proposal);
    setProposalOrigin(origin);
  }, []);

  const syncAgentTask = useCallback((task: AgentLoopTask) => {
    agentSessionRecorderRef.current?.recordTask(task);
    setAgentTask(task);
    setIsRunning(ACTIVE_AGENT_STATES.has(task.status));
    setStreamedText(extractAssistantText(task.output));
    const synchronized = getAgentPendingProposal(task);
    if (synchronized.proposal) {
      setProposalState(synchronized.proposal, synchronized.origin);
      setProposalNotice(null);
    } else if (proposalOriginRef.current?.mode === "agent" && proposalOriginRef.current.taskId === task.id) {
      const priorOrigin = proposalOriginRef.current;
      const notice = discardedProposalNotice(task.status);
      pendingProposalRef.current = null;
      setPendingProposal(null);
      if (task.status === "WaitingForPatchApproval") {
        proposalOriginRef.current = priorOrigin;
      } else {
        proposalOriginRef.current = null;
        setProposalOrigin(null);
        if (notice) setProposalNotice(notice);
      }
    }
    setCurrentProposal((task.patchHistory.at(-1) as PatchProposal | undefined) ?? null);
    const rollback = agentLoopRef.current?.canRollback(task.id)
      ?? { allowed: false, reason: "Rollback becomes available after the Agent stops or finishes." };
    setAgentRollbackAvailable(rollback.allowed);
    setAgentRollbackReason(rollback.reason ?? null);
    if (task.error) {
      setPatchErrors((previous) => previous.length > 0
        ? previous
        : [{ code: "provider_failed", message: task.error! }]);
    }
  }, [setProposalState]);

  useEffect(() => {
    if (isRunning) return;
    const provider = getProvider();
    const newRuntime = createSingleTurnRuntime(provider, getResolvedModel());
    setRuntime(newRuntime);
    setSession(newRuntime.createSession("KerniQ Session"));
    agentUnsubscribeRef.current?.();
    agentUnsubscribeRef.current = null;
    agentLoopRef.current = null;
    agentSessionRecorderRef.current = null;
    setAgentTask(null);
    if (proposalOriginRef.current?.mode === "agent") setProposalState(null, null);
    setAgentRollbackAvailable(false);
    setAgentRollbackReason(null);
    const modelId = getResolvedModel();
    const agentSupported = provider
      && modelId
      && provider.capabilities?.toolAgentLoop === true
      && (provider.supportsAgentTools?.(modelId) ?? true);
    setAgentModeNotice(provider && modelId && !agentSupported
      ? "Agent Mode is unavailable for this provider or model. Normal single-turn mode remains available."
      : null);
    // Provider callbacks intentionally follow the primitive config fields below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.providerId, config.apiKey, config.modelId, config.manualModelId, config.baseUrl, setProposalState]);

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
    try {
      const opened = await openProjectDirectory();
      if (!opened) return;
      const project = new ProjectRuntime({ adapter: opened.adapter });
      await project.openProject(opened.name);
      const binding = await projectBindingIdentity(opened);
      await sessionRuntime.upsertProjectBinding({
        ...binding,
        lastOpenedAt: new Date().toISOString(),
      });
      projectBindingRef.current = binding;
      projectGenerationRef.current += 1;
      selectedPathsRevisionRef.current += 1;
      projectRef.current = project;
      commandRunnerRef.current = opened.commandRunner
        ?? (import.meta.env.DEV ? window.__kerniqTestCommandRunner ?? null : null);
      diffRef.current = new DiffEngine(project.fileAccess, project.fileAccess);
      setProjectName(project.project?.name ?? opened.name);
      setProjectSource(opened.source);
      setFileTree(project.tree);
      setSelectedFileCount(0);
      setSelectedFileSize(0);
      setContextFiles([]);
      setProjectBindingId(binding.bindingId);
      setProjectGeneration(projectGenerationRef.current);
      setSelectedPathsDigest(await digestSelectedPaths([]));
      setCodingPackPreview(null);
      setCodingPackConfirmation(null);
      setCodingPackPreviewError(null);
      setIsCodingPackPreviewLoading(false);
      setCodingPackDestination(null);
      setCodingPackOperation(null);
      setCodingPackStoreError(null);
      setIsCodingPackExportLoading(false);
      setProposalState(null, null);
      setProposalNotice(null);
      setCurrentProposal(null);
      setPatchErrors([]);
      setApplyResults([]);
      setRollbackResults([]);
      setAgentTask(null);
      setAgentRollbackAvailable(false);
      setAgentRollbackReason(null);
      agentUnsubscribeRef.current?.();
      agentUnsubscribeRef.current = null;
      agentLoopRef.current = null;
      agentSessionRecorderRef.current = null;
      if (project.index) ctxRef.current.setProjectInfo(project.project?.name ?? opened.name, project.index);
    } catch (error) {
      setPatchErrors([{
        code: error instanceof ProjectAccessError ? error.code : "file_not_found",
        message: error instanceof ProjectAccessError
          ? error.message
          : "Unable to open the selected project.",
      }]);
    }
  }, [sessionRuntime, setProposalState]);

  const toggleFileSelection = useCallback(async (path: string) => {
    const project = projectRef.current;
    if (!project) return;
    project.toggleSelect(path);
    const revision = selectedPathsRevisionRef.current + 1;
    selectedPathsRevisionRef.current = revision;
    setFileTree(project.tree ? { ...project.tree } : null);
    const selectedPaths = project.selectedPaths;
    setSelectedFileCount(selectedPaths.length);
    setSelectedPathsDigest(null);
    setCodingPackConfirmation(null);
    setCodingPackPreviewError(null);
    setCodingPackOperation(null);
    setCodingPackStoreError(null);
    let totalSize = 0;
    for (const selectedPath of selectedPaths) {
      const entry = project.index?.files.find((file) => file.path === selectedPath);
      if (entry) totalSize += entry.size;
    }
    setSelectedFileSize(totalSize);
    const digest = await digestSelectedPaths(selectedPaths);
    if (
      projectRef.current === project
      && selectedPathsRevisionRef.current === revision
    ) {
      setSelectedPathsDigest(digest);
    }
    await refreshSelectedFiles();
  }, [refreshSelectedFiles]);

  const setCodingPackPurpose = useCallback((purpose: CodingPackPurpose) => {
    codingPackPurposeRef.current = purpose;
    setCodingPackPurposeState(purpose);
    setCodingPackConfirmation(null);
    setCodingPackPreviewError(null);
    setCodingPackOperation(null);
    setCodingPackStoreError(null);
  }, []);

  const refreshCodingPackPreview = useCallback(async () => {
    const project = projectRef.current;
    const binding = projectBindingRef.current;
    const generation = projectGenerationRef.current;
    const selectedPaths = project?.selectedPaths ?? [];
    const purpose = codingPackPurposeRef.current;
    if (!project || !binding) {
      setCodingPackPreviewError("coding_pack_project_changed");
      return;
    }
    if (selectedPaths.length === 0) {
      setCodingPackPreviewError("coding_pack_no_selection");
      return;
    }

    setIsCodingPackPreviewLoading(true);
    setCodingPackPreviewError(null);
    setCodingPackPreview(null);
    setCodingPackConfirmation(null);
    setCodingPackOperation(null);
    setCodingPackStoreError(null);
    try {
      const preview = await createSelectedFileCodingPackPreview({
        projectBindingId: binding.bindingId,
        projectGeneration: generation,
        selectedPaths,
        purpose,
        source: project.codingPackSourceAccess,
      });
      const currentSelectedPathsDigest = await digestSelectedPaths(project.selectedPaths);
      if (
        projectRef.current !== project
        || projectBindingRef.current?.bindingId !== binding.bindingId
        || projectGenerationRef.current !== generation
      ) {
        throw new CodingPackPreviewError("coding_pack_project_changed");
      }
      if (
        currentSelectedPathsDigest !== preview.selectedPathsDigest
        || codingPackPurposeRef.current !== purpose
      ) {
        throw new CodingPackPreviewError("coding_pack_preview_stale");
      }
      setSelectedPathsDigest(currentSelectedPathsDigest);
      setCodingPackPreview(preview);
    } catch (error) {
      setCodingPackPreviewError(
        error instanceof CodingPackPreviewError
          ? error.code
          : "coding_pack_selection_failed",
      );
    } finally {
      setIsCodingPackPreviewLoading(false);
    }
  }, []);

  const confirmCurrentCodingPackPreview = useCallback(async () => {
    const preview = codingPackPreview;
    const binding = projectBindingRef.current;
    if (!preview || !binding || selectedPathsDigest === null) {
      setCodingPackPreviewError("coding_pack_preview_stale");
      return;
    }
    try {
      const confirmation = await confirmCodingPackPreview(preview, {
        projectBindingId: binding.bindingId,
        projectGeneration: projectGenerationRef.current,
        selectedPathsDigest,
        purpose: codingPackPurposeRef.current,
        selectionRulesVersion: codingPackSelectionRulesVersion,
      });
      setCodingPackConfirmation(confirmation);
      setCodingPackOperation(null);
      setCodingPackStoreError(null);
      setCodingPackPreviewError(null);
    } catch (error) {
      setCodingPackConfirmation(null);
      setCodingPackPreviewError(
        error instanceof CodingPackPreviewError
          ? error.code
          : "coding_pack_confirmation_mismatch",
      );
    }
  }, [codingPackPreview, selectedPathsDigest]);

  const chooseCurrentCodingPackDestination = useCallback(async () => {
    if (!codingPackPreview || !codingPackConfirmation || selectedPathsDigest === null) {
      setCodingPackStoreError("coding_pack_proposal_invalid");
      return;
    }
    setIsCodingPackExportLoading(true);
    setCodingPackStoreError(null);
    try {
      await verifyCodingPackPreviewConfirmation(codingPackConfirmation, codingPackPreview);
      const destination = await chooseCodingPackDestination(codingPackStoreRef.current);
      if (destination) {
        setCodingPackDestination(destination);
        setCodingPackOperation(null);
      }
    } catch (error) {
      setCodingPackStoreError(codingPackStoreErrorCode(
        error,
        "coding_pack_destination_unavailable",
      ));
    } finally {
      setIsCodingPackExportLoading(false);
    }
  }, [codingPackConfirmation, codingPackPreview, selectedPathsDigest]);

  const createCurrentCodingPackExportProposal = useCallback(async () => {
    const preview = codingPackPreview;
    const confirmation = codingPackConfirmation;
    const destination = codingPackDestination;
    const binding = projectBindingRef.current;
    if (
      !preview
      || !confirmation
      || !destination
      || !binding
      || selectedPathsDigest === null
      || !hasCodingPackDestinationCapability(destination)
      || isCodingPackPreviewStale(preview, {
        projectBindingId: binding.bindingId,
        projectGeneration: projectGenerationRef.current,
        selectedPathsDigest,
        purpose: codingPackPurposeRef.current,
        selectionRulesVersion: codingPackSelectionRulesVersion,
      })
    ) {
      setCodingPackStoreError(
        destination && !hasCodingPackDestinationCapability(destination)
          ? "coding_pack_destination_unavailable"
          : "coding_pack_proposal_invalid",
      );
      return;
    }
    setIsCodingPackExportLoading(true);
    setCodingPackStoreError(null);
    try {
      const snapshot = await createVerifiedCodingPackExportProposal({
        store: codingPackStoreRef.current,
        preview,
        confirmation,
        proposalInput: {
          preview: {
            projectBindingId: preview.projectBindingId,
            projectGeneration: preview.projectGeneration,
            candidatePathsDigest: preview.selection.candidatePathsDigest,
            sourceFingerprint: preview.selection.sourceFingerprint,
            packId: preview.selection.packId,
            manifestDigest: preview.manifest.manifestDigest,
          },
          previewConfirmation: {
            projectBindingId: confirmation.projectBindingId,
            projectGeneration: confirmation.projectGeneration,
            selectedPathsDigest: confirmation.selectedPathsDigest,
            sourceFingerprint: confirmation.sourceFingerprint,
            packId: confirmation.packId,
            manifestDigest: confirmation.manifestDigest,
            confirmedAt: confirmation.confirmedAt,
          },
          destination,
        },
      });
      setCodingPackOperation(snapshot);
      setCodingPackRecoveredOperation(snapshot);
    } catch (error) {
      setCodingPackStoreError(codingPackStoreErrorCode(error));
    } finally {
      setIsCodingPackExportLoading(false);
    }
  }, [
    codingPackConfirmation,
    codingPackDestination,
    codingPackPreview,
    selectedPathsDigest,
  ]);

  const confirmCurrentCodingPackExportProposal = useCallback(async () => {
    const snapshot = codingPackOperation;
    if (!snapshot || snapshot.operation.state !== "proposed") {
      setCodingPackStoreError("coding_pack_approval_mismatch");
      return;
    }
    setIsCodingPackExportLoading(true);
    setCodingPackStoreError(null);
    try {
      const approval = codingPackStoreRef.current.createCodingPackExportApproval({
        operationId: snapshot.operation.operationId,
        proposalDigest: snapshot.proposal.proposalDigest,
        expiresAt: snapshot.proposal.expiresAt,
      });
      const confirmed = await codingPackStoreRef.current
        .confirmCodingPackExportProposal(approval);
      setCodingPackOperation(confirmed);
      setCodingPackRecoveredOperation(confirmed);
    } catch (error) {
      setCodingPackStoreError(codingPackStoreErrorCode(error));
    } finally {
      setIsCodingPackExportLoading(false);
    }
  }, [codingPackOperation]);

  const evaluateCurrentCodingPackExportPolicy = useCallback(async () => {
    const snapshot = codingPackOperation;
    const bridge: CodingPackAgentFuseBridgeClient | null =
      createManagedPythonBridge()
      ?? (import.meta.env.DEV
        ? window.__kerniqTestCodingPackAgentFuseBridge ?? null
        : null);
    if (
      !snapshot
      || snapshot.operation.state !== "confirmed"
      || !snapshot.approval
      || !codingPackDestination
      || !hasCodingPackDestinationCapability(codingPackDestination)
      || !bridge
    ) {
      setCodingPackStoreError(
        codingPackDestination
          ? "coding_pack_store_unavailable"
          : "coding_pack_destination_unavailable",
      );
      return;
    }
    setIsCodingPackExportLoading(true);
    setCodingPackStoreError(null);
    try {
      await evaluateCodingPackExportPolicy({
        store: codingPackStoreRef.current,
        adapter: new CodingPackAgentFuseAdapter({ bridge }),
        operationId: snapshot.operation.operationId,
        destinationCapabilityVerifier: {
          async verifyDestinationCapability(current) {
            return current.destinationBindingId
                === codingPackDestination.destinationBindingId
              && current.destinationFingerprint
                === codingPackDestination.destinationFingerprint
              && createCodingPackDestinationCapabilityVerifier()
                .verifyDestinationCapability(current);
          },
        },
      });
      const decided = await codingPackStoreRef.current.getCodingPackOperation(
        snapshot.operation.operationId,
      );
      if (!decided) throw new CodingPackStoreError("coding_pack_store_unavailable");
      setCodingPackOperation(decided);
      setCodingPackRecoveredOperation(decided);
    } catch (error) {
      setCodingPackStoreError(codingPackStoreErrorCode(error));
    } finally {
      setIsCodingPackExportLoading(false);
    }
  }, [codingPackDestination, codingPackOperation]);

  const createPatchAdapter = useCallback((project: ProjectRuntime): AgentPatchAdapter => ({
    prepare: async (response, taskId) => {
      const parsed = parseModelPatchResponse(response, taskId);
      if (!parsed.proposal) {
        if (parsed.error && parsed.error.code !== "patch_not_present") {
          setPatchErrors([parsed.error]);
        }
        return parsed;
      }
      const eligiblePaths = new Set(project.index?.files.map((file) => file.path) ?? []);
      const unknownFile = parsed.proposal.files.find((file) => !eligiblePaths.has(file.path));
      if (unknownFile) {
        return {
          assistantText: parsed.assistantText,
          proposal: null,
          error: {
            code: "invalid_patch_shape",
            path: unknownFile.path,
            message: `The model proposed a file outside the indexed project: ${unknownFile.path}`,
          },
        };
      }
      const conflicts = await diffRef.current.validateProposal(parsed.proposal);
      if (conflicts.length > 0) {
        return {
          assistantText: parsed.assistantText,
          proposal: null,
          error: {
            code: conflicts[0].type === "line_mismatch" ? "content_mismatch" : conflicts[0].type,
            path: conflicts[0].path,
            message: conflicts[0].detail,
          },
        };
      }
      return parsed;
    },
    apply: async (proposal: AgentPatchProposal) => {
      const results = await diffRef.current.apply(proposal as PatchProposal);
      setApplyResults(results);
      if (results.every((result) => result.success)) {
        setCurrentProposal(proposal as PatchProposal);
        await refreshSelectedFiles();
      } else {
        setPatchErrors(results.filter((result) => !result.success).map((result) => ({
          code: result.code ?? "write_failed",
          path: result.path,
          message: result.error ?? "The patch could not be applied.",
        })));
      }
      return results;
    },
    reject: (proposal: AgentPatchProposal) => {
      diffRef.current.reject(proposal as PatchProposal);
      setApplyResults([]);
    },
    rollback: async (proposal: AgentPatchProposal) => {
      const results = await diffRef.current.rollback(proposal as PatchProposal);
      setRollbackResults(results);
      if (results.every((result) => result.success)) {
        setApplyResults([]);
        await refreshSelectedFiles();
      } else {
        setPatchErrors(results.filter((result) => !result.success).map((result) => ({
          code: result.code ?? "rollback_failed",
          path: result.path,
          message: result.error ?? "Rollback failed.",
        })));
      }
      return results;
    },
  }), [refreshSelectedFiles]);

  const sendPrompt = useCallback(async (prompt: string) => {
    if (!session || !prompt.trim()) return;
    setProposalState(null, null);
    setProposalNotice(null);
    setCurrentProposal(null);
    setPatchErrors([]);
    setApplyResults([]);
    setRollbackResults([]);
    setAgentTask(null);

    const bundle = await ctxRef.current.buildContext({ prompt, selectedFiles: contextFiles });
    setLastBundle(bundle);
    setEstimatedTokens(bundle.estimatedTokens);
    const provider = getProvider();
    const modelId = getResolvedModel();
    const project = projectRef.current;

    if (provider && modelId && project) {
      const commandRunner = commandRunnerRef.current;
      const commandDecisionBridge: AgentFuseBridgeClient | null =
        createManagedPythonBridge()
        ?? (import.meta.env.DEV
          ? window.__kerniqTestAgentFuseBridge ?? null
          : null);
      const commandExecutionAvailable = commandRunner !== null
        && commandDecisionBridge !== null;
      const projectAccess: AgentProjectAccess = {
        listFiles: () => project.index?.files.map((file) => ({ path: file.path, size: file.size })) ?? [],
        readFile: (path) => project.fileAccess.readFile(path),
        commandExecutionAvailable,
      };
      const agentSupported = provider.capabilities?.toolAgentLoop === true
        && (provider.supportsAgentTools?.(modelId) ?? true);
      if (agentSupported) {
        const binding = projectBindingRef.current;
        if (!binding) {
          setPatchErrors([{
            code: "write_target_unavailable",
            message: "The opened project could not be bound to session history.",
          }]);
          return;
        }
        const taskId = crypto.randomUUID();
        await sessionRuntime.createSession({
          id: taskId,
          title: sessionTitle(prompt),
          projectBindingId: binding.bindingId,
          providerId: provider.id,
          modelId,
        });
        const commandDecisionAdapter = commandExecutionAvailable
          ? await createProjectCommandAgentFuseAdapter(commandDecisionBridge)
          : null;
        const recorder = new AgentSessionLedgerRecorder({
          runtime: sessionRuntime,
          sessionId: taskId,
          onRecorded: refreshSessions,
          ...(commandDecisionAdapter
            ? {
              commandDecisionAdapter,
              projectBindingId: binding.bindingId,
              projectFingerprint: binding.projectFingerprint,
            }
            : {}),
        });
        const loop = new AgentLoopRuntime({
          provider,
          modelId,
          project: projectAccess,
          patchAdapter: createPatchAdapter(project),
          sideEffectLifecycle: recorder,
          requireCommandDecision: true,
          ...(commandExecutionAvailable ? { commandRunner } : {}),
        });
        agentSessionRecorderRef.current = recorder;
        recorder.recordUserMessage(prompt);
        await recorder.flush();
        agentLoopRef.current = loop;
        setAgentModeNotice(projectSource === "browser" && !commandExecutionAvailable
          ? "Agent Mode is active. Browser mode supports project inspection and approved patches, but native commands are unavailable."
          : null);
        agentUnsubscribeRef.current?.();
        agentUnsubscribeRef.current = loop.subscribe(syncAgentTask);
        const task = await loop.start(taskId, bundle.assembledPrompt);
        syncAgentTask(task);
        try {
          await recorder.flush();
        } catch {
          agentUnsubscribeRef.current?.();
          agentUnsubscribeRef.current = null;
          agentLoopRef.current = null;
          agentSessionRecorderRef.current = null;
          setAgentTask(null);
          setIsRunning(false);
          setPatchErrors([{
            code: "provider_failed",
            message: "Agent Session evidence could not be persisted. No approval action was made available.",
          }]);
        }
        return;
      }
      setAgentModeNotice("Agent Mode is unavailable for this provider or model. Normal single-turn mode remains available.");
    } else if (provider && modelId && !project) {
      setAgentModeNotice("Open a project to use Agent Mode. This request used normal single-turn mode.");
    }

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
    setProposalState(parsed.proposal, { mode: "single_turn", taskId: parsed.proposal.taskId });
  }, [contextFiles, createPatchAdapter, getProvider, getResolvedModel, projectSource, refreshSessions, runtime, session, sessionRuntime, setProposalState, syncAgentTask]);

  const applyProposal = useCallback(async () => {
    if (!pendingProposal || isApplying) return;
    const route = resolveProposalActionRoute(pendingProposal, proposalOrigin, agentTask);
    if (!route) {
      if (proposalOrigin?.mode === "agent") {
        setProposalState(null, null);
        setProposalNotice("This Agent proposal is no longer actionable.");
      }
      return;
    }
    setIsApplying(true);
    setPatchErrors([]);
    try {
      if (route === "agent" && agentLoopRef.current && proposalOrigin?.mode === "agent") {
        syncAgentTask(await agentLoopRef.current.approvePatch(proposalOrigin.taskId));
        await agentSessionRecorderRef.current?.flush();
        return;
      }
      if (route !== "single_turn") return;
      const results = await diffRef.current.apply(pendingProposal);
      setApplyResults(results);
      if (results.length === pendingProposal.files.length && results.every((result) => result.success)) {
        setCurrentProposal(pendingProposal);
        setProposalState(null, null);
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
  }, [agentTask, isApplying, pendingProposal, proposalOrigin, refreshSelectedFiles, setProposalState, syncAgentTask]);

  const rejectProposal = useCallback(async () => {
    if (!pendingProposal) return;
    const route = resolveProposalActionRoute(pendingProposal, proposalOrigin, agentTask);
    if (!route) {
      if (proposalOrigin?.mode === "agent") {
        setProposalState(null, null);
        setProposalNotice("This Agent proposal is no longer actionable.");
      }
      return;
    }
    if (route === "agent" && agentLoopRef.current && proposalOrigin?.mode === "agent") {
      syncAgentTask(await agentLoopRef.current.rejectPatch(proposalOrigin.taskId));
      await agentSessionRecorderRef.current?.flush();
      return;
    }
    if (route !== "single_turn") return;
    diffRef.current.reject(pendingProposal);
    setProposalState(null, null);
    setPatchErrors([]);
    setApplyResults([]);
  }, [agentTask, pendingProposal, proposalOrigin, setProposalState, syncAgentTask]);

  const approveCommand = useCallback(async () => {
    if (!agentTask || !agentLoopRef.current || agentTask.status !== "WaitingForCommandApproval") return;
    syncAgentTask(await agentLoopRef.current.approveCommand(agentTask.id));
    await agentSessionRecorderRef.current?.flush();
  }, [agentTask, syncAgentTask]);

  const denyCommand = useCallback(async () => {
    if (!agentTask || !agentLoopRef.current || agentTask.status !== "WaitingForCommandApproval") return;
    syncAgentTask(await agentLoopRef.current.denyCommand(agentTask.id));
    await agentSessionRecorderRef.current?.flush();
  }, [agentTask, syncAgentTask]);

  const rollbackProposal = useCallback(async () => {
    if (!currentProposal || isRollingBack) return;
    if (agentTask && agentLoopRef.current && agentTask.patchHistory.length > 0) {
      const rollback = agentLoopRef.current.canRollback(agentTask.id);
      if (!rollback.allowed) {
        setAgentRollbackAvailable(false);
        setAgentRollbackReason(rollback.reason ?? "Rollback is not available yet.");
        return;
      }
    }
    setIsRollingBack(true);
    setPatchErrors([]);
    try {
      if (agentTask && agentLoopRef.current && agentTask.patchHistory.length > 0) {
        await agentLoopRef.current.rollbackLatest(agentTask.id);
        const updated = agentLoopRef.current.getTask(agentTask.id);
        if (updated) syncAgentTask(updated);
        return;
      }
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
  }, [agentTask, currentProposal, isRollingBack, refreshSelectedFiles, syncAgentTask]);

  const rollbackAllPatches = useCallback(async () => {
    if (!agentTask || !agentLoopRef.current || isRollingBack) return;
    const rollback = agentLoopRef.current.canRollback(agentTask.id);
    if (!rollback.allowed) {
      setAgentRollbackAvailable(false);
      setAgentRollbackReason(rollback.reason ?? "Rollback is not available yet.");
      return;
    }
    setIsRollingBack(true);
    try {
      await agentLoopRef.current.rollbackAll(agentTask.id);
      const updated = agentLoopRef.current.getTask(agentTask.id);
      if (updated) syncAgentTask(updated);
    } finally {
      setIsRollingBack(false);
    }
  }, [agentTask, isRollingBack, syncAgentTask]);

  const stopTask = useCallback(async () => {
    if (agentTask && agentLoopRef.current && ACTIVE_AGENT_STATES.has(agentTask.status)) {
      await agentLoopRef.current.cancel(agentTask.id);
      const updated = agentLoopRef.current.getTask(agentTask.id);
      if (updated) syncAgentTask(updated);
      await agentSessionRecorderRef.current?.flush();
      return;
    }
    if (currentTask) runtime.cancelTask(currentTask.id);
  }, [agentTask, currentTask, runtime, syncAgentTask]);

  const proposalActionsAvailable = resolveProposalActionRoute(pendingProposal, proposalOrigin, agentTask) !== null;
  const codingPackPreviewStale = codingPackPreview === null
    ? false
    : projectBindingId === null
      || selectedPathsDigest === null
      || isCodingPackPreviewStale(codingPackPreview, {
        projectBindingId,
        projectGeneration,
        selectedPathsDigest,
        purpose: codingPackPurpose,
        selectionRulesVersion: codingPackSelectionRulesVersion,
      });

  return {
    isRunning,
    currentTask,
    agentTask,
    agentModeNotice,
    streamedText,
    sendPrompt,
    stopTask,
    projectName,
    projectSource,
    fileTree,
    openProject,
    toggleFileSelection,
    selectedFileCount,
    selectedFileSize,
    contextFiles,
    codingPackPurpose,
    setCodingPackPurpose,
    codingPackPreview,
    codingPackConfirmation,
    codingPackPreviewError,
    codingPackPreviewStale,
    isCodingPackPreviewLoading,
    refreshCodingPackPreview,
    confirmCurrentCodingPackPreview,
    codingPackDestination,
    codingPackOperation,
    codingPackRecoveredOperation,
    codingPackStoreError,
    isCodingPackExportLoading,
    chooseCurrentCodingPackDestination,
    createCurrentCodingPackExportProposal,
    confirmCurrentCodingPackExportProposal,
    evaluateCurrentCodingPackExportPolicy,
    lastBundle,
    estimatedTokens,
    pendingProposal,
    proposalOrigin,
    proposalNotice,
    proposalActionsAvailable,
    currentProposal,
    patchErrors,
    applyResults,
    rollbackResults,
    isApplying,
    isRollingBack,
    agentRollbackAvailable,
    agentRollbackReason,
    applyProposal,
    rejectProposal,
    rollbackProposal,
    rollbackAllPatches,
    approveCommand,
    denyCommand,
  };
}

function createSingleTurnRuntime(
  provider: ModelProvider | null,
  modelId: string | null | undefined,
): AgentRuntime {
  return provider
    ? new AgentRuntime({
        providers: new Map([[provider.id, provider]]),
        defaultProviderId: provider.id,
        defaultModelId: modelId ?? undefined,
      })
    : new AgentRuntime();
}

function sessionTitle(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}...`;
}

function codingPackStoreErrorCode(
  error: unknown,
  fallback: CodingPackStoreErrorCode = "coding_pack_persistence_failed",
): CodingPackStoreErrorCode {
  return error instanceof CodingPackStoreError ? error.code : fallback;
}
