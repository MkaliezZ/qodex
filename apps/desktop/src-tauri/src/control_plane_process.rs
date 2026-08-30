use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const AUDITED_DSH_VERSION: &str = "0.1.2-alpha.1";
const AUDITED_DSH_REVISION: &str = "cd5ef8148158c3a752a658978873241fdf8e2bbc";
const AGENTFUSE_PACKAGE: &str = "@dhms-agentfuse/dsh-agentfuse";
const PRODUCTION_OBSERVER_PACKAGE: &str = "@kerniq/dsh-control-plane-observer";
const PROCESS_TIMEOUT: Duration = Duration::from_secs(300);
const OUTPUT_LIMIT: usize = 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunBackendRequest {
    pub backend_id: String,
    pub task_id: String,
    pub worker_run_id: String,
    pub workspace: String,
    pub prompt: String,
    pub governance_required: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeProbe {
    available: bool,
    version: String,
    model: Option<String>,
    supports_streaming: bool,
    supports_cancel: bool,
    supports_tool_events: bool,
    supports_resume: bool,
    runtime_revision: Option<String>,
    provider_route: Option<String>,
    governance: Option<DshGovernanceProbe>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DshGovernanceProbe {
    mode: &'static str,
    compatible_runtime: bool,
    agent_fuse_adapter_available: bool,
    agent_fuse_version: Option<String>,
    pre_dispatch_seam_available: bool,
    production_observer_available: bool,
    governed_profile_valid: bool,
    evidence_capture_available: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendRunOutput {
    result: AgentTaskResult,
    governance_evidence_inputs: Vec<Value>,
    observations: Vec<AgentObservation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentTaskResult {
    findings: Vec<ReviewFinding>,
    raw_result_reference: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct ReviewDocument {
    findings: Vec<ReviewFinding>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewFinding {
    finding: String,
    evidence: String,
    severity: String,
    #[serde(alias = "smallest_fix")]
    smallest_fix: String,
    files: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentObservation {
    kind: &'static str,
    at: String,
    summary: String,
}

#[derive(Debug)]
struct ProcessOutput {
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GovernanceEvent {
    phase: String,
    tool_call_id: String,
    tool_name: String,
    decision: Option<String>,
}

#[derive(Debug, Default)]
struct GovernanceCall {
    tool_name: String,
    model_request: bool,
    pre_execute: bool,
    decision: Option<String>,
    dispatch: bool,
    result: bool,
}

pub fn probe_backend(backend_id: &str) -> Result<AgentRuntimeProbe, String> {
    match backend_id {
        "codex" => Ok(probe_codex()),
        "dsh-deepseek" => Ok(probe_dsh()),
        _ => Err("Unsupported control-plane backend.".into()),
    }
}

pub fn run_backend(
    request: RunBackendRequest,
    workspace: &Path,
) -> Result<BackendRunOutput, String> {
    require_request_identity(&request)?;
    match request.backend_id.as_str() {
        "codex" => run_codex(request, workspace),
        "dsh-deepseek" => run_dsh(request, workspace),
        _ => Err("Unsupported control-plane backend.".into()),
    }
}

fn probe_codex() -> AgentRuntimeProbe {
    let output = Command::new("codex").arg("--version").output();
    let version = output
        .ok()
        .filter(|result| result.status.success())
        .and_then(|result| String::from_utf8(result.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    AgentRuntimeProbe {
        available: version.is_some(),
        version: version.unwrap_or_else(|| "unavailable".into()),
        model: None,
        supports_streaming: false,
        supports_cancel: false,
        supports_tool_events: true,
        supports_resume: false,
        runtime_revision: None,
        provider_route: None,
        governance: None,
    }
}

/// Runtime revision of the configured DSH checkout.
///
/// The `#[cfg(test)]` override exists only in test builds: hermetic admission
/// regressions use it to represent the audited revision without a real
/// `cd5ef814…` checkout. Release builds always resolve the revision through
/// git, and the audited-version/revision comparison is unchanged.
fn dsh_runtime_revision(root: Option<&Path>) -> Option<String> {
    #[cfg(test)]
    if let Some(value) = std::env::var("KERNIQ_TEST_DSH_REVISION")
        .ok()
        .filter(|value| !value.is_empty())
    {
        return Some(value);
    }
    root.and_then(|path| {
        command_text(
            "git",
            &["-C", path.to_string_lossy().as_ref(), "rev-parse", "HEAD"],
        )
    })
}

/// The single effective DSH invocation that both admission probing and
/// governed execution derive their arguments from. The entrypoint is derived
/// from the audited runtime root; an explicitly configured
/// `KERNIQ_DSH_RUNTIME_ENTRYPOINT` is accepted only when it canonicalizes to
/// exactly the audited checkout's CLI file, so no independently configurable
/// trust object can substitute another runtime after admission.
struct EffectiveDshInvocation {
    runtime_root: PathBuf,
    entrypoint: PathBuf,
    profile: String,
    product_patch: Option<PathBuf>,
}

impl EffectiveDshInvocation {
    /// Derives the invocation from the environment. Returns `None` when the
    /// runtime identity cannot be resolved confidently — missing root or
    /// entrypoint, or a configured entrypoint that is not the audited
    /// checkout's canonical CLI file — and admission then fails closed.
    fn from_environment() -> Option<Self> {
        let runtime_root = configured_path("KERNIQ_DSH_RUNTIME_ROOT")?;
        let derived = runtime_root
            .join("apps")
            .join("cli")
            .join("lib")
            .join("bin.js");
        let entrypoint = match configured_path("KERNIQ_DSH_RUNTIME_ENTRYPOINT") {
            Some(configured) => {
                // Canonical forms resolve symlinks/junctions and case only
                // for the identity comparison; execution keeps the original
                // path because node cannot execute `\\?\`-prefixed paths.
                let canonical_configured = fs::canonicalize(&configured).ok()?;
                let canonical_derived = fs::canonicalize(&derived).ok()?;
                // Exact canonical equality only: an entrypoint merely
                // somewhere under the root is not trust.
                if canonical_configured != canonical_derived {
                    return None;
                }
                if !configured.is_file() {
                    return None;
                }
                configured
            }
            None => derived,
        };
        if !entrypoint.is_file() {
            return None;
        }
        let profile = std::env::var("KERNIQ_DSH_PROFILE").unwrap_or_else(|_| "headless".into());
        let product_patch = configured_path("KERNIQ_DSH_PRODUCT_PATCH");
        Some(EffectiveDshInvocation {
            runtime_root,
            entrypoint,
            profile,
            product_patch,
        })
    }

    /// The configuration-determining arguments shared by the admission dump
    /// and the agent execution. The prompt is execution-only and deliberately
    /// excluded; profile and product patch must never diverge between probe
    /// and run.
    fn configuration_args(&self) -> Vec<String> {
        let mut args = vec!["--profile".to_string(), self.profile.clone()];
        if let Some(patch) = &self.product_patch {
            args.push("--patch".to_string());
            args.push(patch.to_string_lossy().into_owned());
        }
        args
    }
}

fn probe_dsh() -> AgentRuntimeProbe {
    let invocation = EffectiveDshInvocation::from_environment();
    let runtime_available = invocation.is_some();
    let version = invocation
        .as_ref()
        .filter(|_| runtime_available)
        .and_then(|effective| {
            command_text(
                "node",
                &[effective.entrypoint.to_string_lossy().as_ref(), "--version"],
            )
        })
        .unwrap_or_else(|| "unavailable".into());
    let revision =
        dsh_runtime_revision(invocation.as_ref().map(|effective| effective.runtime_root.as_path()));
    // Version and revision are necessary but not sufficient: the runtime
    // identity must also be bound to the audited checkout.
    let compatible_runtime = runtime_available
        && version == AUDITED_DSH_VERSION
        && revision.as_deref() == Some(AUDITED_DSH_REVISION);
    let profile = configured_profile_dir();
    let dump = invocation.as_ref().and_then(dump_dsh_profile);
    let agent_fuse_version = profile.as_deref().and_then(installed_agent_fuse_version);
    let agent_fuse_adapter_available = agent_fuse_version.is_some()
        && dump
            .as_deref()
            .is_some_and(|value| dump_has_enabled_plugin(value, AGENTFUSE_PACKAGE));
    let pre_dispatch_seam_available = compatible_runtime;
    let production_observer_available = dump
        .as_deref()
        .is_some_and(|value| dump_has_enabled_plugin(value, PRODUCTION_OBSERVER_PACKAGE));
    let governed_profile_valid = dump.as_deref().is_some_and(|value| {
        governed_profile_is_product_ready(value, agent_fuse_adapter_available)
    });
    let (provider_route, model) = dump.as_deref().map(dsh_default_model).unwrap_or_default();
    let evidence_capture_available = configured_path("KERNIQ_DSH_EVIDENCE_PATH")
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .is_some_and(|parent| parent.is_dir());

    AgentRuntimeProbe {
        available: runtime_available,
        version,
        model,
        supports_streaming: false,
        supports_cancel: false,
        supports_tool_events: true,
        supports_resume: false,
        runtime_revision: revision,
        provider_route,
        governance: Some(DshGovernanceProbe {
            mode: "pre_dispatch_plugin",
            compatible_runtime,
            agent_fuse_adapter_available,
            agent_fuse_version,
            pre_dispatch_seam_available,
            production_observer_available,
            governed_profile_valid,
            evidence_capture_available,
        }),
    }
}

fn run_codex(request: RunBackendRequest, workspace: &Path) -> Result<BackendRunOutput, String> {
    if request.governance_required {
        return Err("Codex cannot start a task that requires governed execution.".into());
    }
    if !probe_codex().available {
        return Err("Codex backend is unavailable.".into());
    }
    let token = temporary_token(&request.worker_run_id);
    let schema_path = std::env::temp_dir().join(format!("kerniq-codex-schema-{token}.json"));
    let result_path = std::env::temp_dir().join(format!("kerniq-codex-result-{token}.json"));
    fs::write(&schema_path, review_schema())
        .map_err(|_| "Codex result schema could not be prepared.")?;
    let prompt = bounded_review_prompt(&request.prompt);
    let mut command = Command::new("codex");
    command.args([
        "exec",
        "--json",
        "--sandbox",
        "read-only",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--output-schema",
        schema_path.to_string_lossy().as_ref(),
        "-o",
        result_path.to_string_lossy().as_ref(),
        "-C",
        workspace.to_string_lossy().as_ref(),
        &prompt,
    ]);
    configure_agent_environment(&mut command, false);
    let output = run_bounded(command)?;
    let raw = fs::read_to_string(&result_path).unwrap_or_default();
    let _ = fs::remove_file(&schema_path);
    let _ = fs::remove_file(&result_path);
    if !output.success {
        return Err(format!(
            "Codex backend exited without a result (exit {}).",
            output
                .exit_code
                .map_or_else(|| "unknown".into(), |value| value.to_string())
        ));
    }
    let document = parse_review_document(&raw)?;
    let mut observations = codex_observations(&output.stdout);
    observations.push(observation("process_completed", "Codex task completed."));
    Ok(BackendRunOutput {
        result: AgentTaskResult {
            findings: document.findings,
            raw_result_reference: sha256_reference(raw.as_bytes()),
        },
        governance_evidence_inputs: vec![],
        observations,
    })
}

fn run_dsh(request: RunBackendRequest, workspace: &Path) -> Result<BackendRunOutput, String> {
    let probe = probe_dsh();
    let governance = probe
        .governance
        .as_ref()
        .ok_or("DSH governance probe is unavailable.")?;
    let governed = governance.compatible_runtime
        && governance.agent_fuse_adapter_available
        && governance.pre_dispatch_seam_available
        && governance.production_observer_available
        && governance.governed_profile_valid
        && governance.evidence_capture_available;
    if request.governance_required && !governed {
        return Err("Governed DSH admission failed before process start.".into());
    }
    if !probe.available {
        return Err("DeepSeek Harness backend is unavailable.".into());
    }
    let invocation = EffectiveDshInvocation::from_environment()
        .ok_or("DeepSeek Harness runtime identity could not be established.")?;
    let evidence_path = configured_path("KERNIQ_DSH_EVIDENCE_PATH")
        .ok_or("DeepSeek Harness evidence capture is not configured.")?;
    fs::write(&evidence_path, b"")
        .map_err(|_| "DeepSeek Harness evidence capture could not be initialized.")?;
    let prompt = bounded_review_prompt(&request.prompt);
    let mut command = Command::new("node");
    command.arg(&invocation.entrypoint);
    let configuration_args = invocation.configuration_args();
    let arg_refs: Vec<&str> = configuration_args.iter().map(String::as_str).collect();
    command.args(&arg_refs);
    command.arg(prompt).current_dir(workspace);
    configure_agent_environment(&mut command, true);
    let output = run_bounded(command)?;
    if !output.success {
        return Err(format!(
            "DeepSeek Harness backend exited without a result (exit {}).",
            output
                .exit_code
                .map_or_else(|| "unknown".into(), |value| value.to_string())
        ));
    }
    let document = parse_review_document(&output.stdout)?;
    let events = read_governance_events(&evidence_path)?;
    let evidence = governance_evidence_inputs(&request, &probe, events);
    let observations = vec![
        observation("process_started", "DeepSeek Harness task started."),
        observation(
            "message_observed",
            "DeepSeek Harness returned a structured result.",
        ),
        observation("process_completed", "DeepSeek Harness task completed."),
    ];
    Ok(BackendRunOutput {
        result: AgentTaskResult {
            findings: document.findings,
            raw_result_reference: sha256_reference(output.stdout.as_bytes()),
        },
        governance_evidence_inputs: evidence,
        observations,
    })
}

fn governance_evidence_inputs(
    request: &RunBackendRequest,
    probe: &AgentRuntimeProbe,
    events: Vec<GovernanceEvent>,
) -> Vec<Value> {
    let mut calls = BTreeMap::<String, GovernanceCall>::new();
    for event in events {
        let call = calls.entry(event.tool_call_id).or_default();
        call.tool_name = event.tool_name;
        match event.phase.as_str() {
            "model_request" => call.model_request = true,
            "pre_execute" => {
                call.pre_execute = true;
                if let Some(decision) = event.decision {
                    call.decision = Some(canonical_policy_decision(&decision).into());
                }
            }
            "dispatch" => call.dispatch = true,
            "result" => call.result = true,
            _ => {}
        }
    }
    calls
        .into_iter()
        .filter_map(|(call_id, call)| {
            let decision = call.decision?;
            let diagnostic = call.tool_name == "kerniq_write_probe";
            let body_started = marker_contains("KERNIQ_DSH_BODY_MARKER_PATH", &call_id);
            let side_effect = target_matches_expected_content();
            let (body_value, body_provenance) = if diagnostic {
                (Value::Bool(body_started), "observed")
            } else {
                (Value::String("unknown".into()), "unknown")
            };
            let (effect_value, effect_provenance) = if diagnostic {
                (Value::Bool(side_effect), "observed")
            } else {
                (Value::String("unknown".into()), "unknown")
            };
            let (model_request_value, model_request_provenance) = if call.model_request {
                (Value::Bool(true), "observed")
            } else {
                (Value::String("unknown".into()), "unknown")
            };
            let (dispatch_value, dispatch_provenance) = if call.dispatch {
                (Value::Bool(true), "observed")
            } else if call.result {
                (Value::Bool(false), "observed")
            } else {
                (Value::String("unknown".into()), "unknown")
            };
            let outcome = if diagnostic {
                match decision.as_str() {
                    "block" if call.result && !call.dispatch && !body_started && !side_effect => "blocked",
                    "allow" if call.dispatch && body_started && side_effect => "succeeded",
                    "ask" if call.result && !call.dispatch && !body_started && !side_effect => "failed_closed",
                    "error-deny" if call.result && !call.dispatch && !body_started && !side_effect => "failed_closed",
                    _ => "unknown",
                }
            } else {
                "unknown"
            };
            let reason = match decision.as_str() {
                "block" => "explicit_denylist",
                "allow" => "allowed",
                "ask" => "requires_approval",
                "error-deny" => "policy_error",
                _ => "policy_result_observed",
            };
            Some(serde_json::json!({
                "taskId": request.task_id,
                "workerRunId": request.worker_run_id,
                "agentId": "dsh-deepseek",
                "agentKind": "deepseek-harness",
                "agentVersion": probe.version,
                "toolCallId": call_id,
                "toolName": call.tool_name,
                "actionSummary": "DeepSeek Harness requested a governed tool.",
                "modelToolCallObserved": { "value": model_request_value, "provenance": model_request_provenance },
                "policyDecision": { "value": decision, "provenance": "observed" },
                "policyReason": reason,
                "preExecuteObserved": { "value": call.pre_execute, "provenance": "observed" },
                "dispatchOccurred": { "value": dispatch_value, "provenance": dispatch_provenance },
                "toolBodyStarted": { "value": body_value, "provenance": body_provenance },
                "physicalSideEffect": { "value": effect_value, "provenance": effect_provenance },
                "outcome": outcome,
                "provenance": {
                    "runtimeSource": format!("deepseek-ai/deepseek-harness@{}", probe.runtime_revision.as_deref().unwrap_or("unknown")),
                    "modelProvider": probe.provider_route.as_deref().unwrap_or("unknown"),
                    "model": probe.model.as_deref().unwrap_or("unknown"),
                    "policyAdapter": format!("{}@{}", AGENTFUSE_PACKAGE, probe.governance.as_ref().and_then(|value| value.agent_fuse_version.as_deref()).unwrap_or("unknown")),
                    "captureMethod": "production observer session and tool lifecycle events; diagnostic markers only for the validation proof tool"
                }
            }))
        })
        .collect()
}

fn read_governance_events(path: &Path) -> Result<Vec<GovernanceEvent>, String> {
    let raw = fs::read_to_string(path)
        .map_err(|_| "DeepSeek Harness evidence capture could not be read.")?;
    Ok(raw
        .lines()
        .filter_map(|line| serde_json::from_str::<GovernanceEvent>(line).ok())
        .collect())
}

fn codex_observations(stdout: &str) -> Vec<AgentObservation> {
    stdout
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter_map(|event| match event.get("type").and_then(Value::as_str) {
            Some("thread.started") => Some(observation("process_started", "Codex thread started.")),
            Some("item.started")
                if event.pointer("/item/type").and_then(Value::as_str)
                    == Some("command_execution") =>
            {
                Some(observation(
                    "tool_observed",
                    "Codex read-only command tool started.",
                ))
            }
            Some("item.completed")
                if event.pointer("/item/type").and_then(Value::as_str) == Some("agent_message") =>
            {
                Some(observation(
                    "message_observed",
                    "Codex emitted a model message.",
                ))
            }
            _ => None,
        })
        .collect()
}

fn run_bounded(mut command: Command) -> Result<ProcessOutput, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|_| "Configured agent process could not be started.")?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Agent stdout could not be captured.")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Agent stderr could not be captured.")?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout));
    let stderr_reader = thread::spawn(move || read_bounded(stderr));
    let started = Instant::now();
    let status = loop {
        if started.elapsed() >= PROCESS_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Configured agent process timed out.".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(_) => return Err("Configured agent process status is unavailable.".into()),
        }
    };
    let stdout = stdout_reader
        .join()
        .map_err(|_| "Agent stdout reader failed.")??;
    let _stderr = stderr_reader
        .join()
        .map_err(|_| "Agent stderr reader failed.")??;
    Ok(ProcessOutput {
        success: status.success(),
        exit_code: status.code(),
        stdout,
    })
}

fn read_bounded(mut reader: impl Read) -> Result<String, String> {
    let mut bytes = Vec::new();
    reader
        .by_ref()
        .take((OUTPUT_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "Agent output could not be read.")?;
    if bytes.len() > OUTPUT_LIMIT {
        return Err("Configured agent process exceeded its output limit.".into());
    }
    String::from_utf8(bytes)
        .map_err(|_| "Configured agent process emitted non-UTF-8 output.".into())
}

fn configure_agent_environment(command: &mut Command, dsh: bool) {
    command.env_clear();
    for key in [
        "PATH",
        "HOME",
        "USERPROFILE",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "LANG",
        "LC_ALL",
        "CODEX_HOME",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    if dsh {
        for (key, value) in std::env::vars_os() {
            let name = key.to_string_lossy();
            if name == "DEEPSEEK_API_KEY" || name == "DSH_HOME" || name.starts_with("KERNIQ_DSH_") {
                command.env(key, value);
            }
        }
        command.env("DO_NOT_TRACK", "1");
        command.env("DSH_TELEMETRY_MODE", "DISABLED");
        command.env("DSH_PERMISSION_MODE", "workspace-write");
    }
}

fn parse_review_document(raw: &str) -> Result<ReviewDocument, String> {
    let trimmed = raw.trim();
    let parsed = serde_json::from_str::<ReviewDocument>(trimmed)
        .or_else(|_| {
            let start = trimmed
                .find('{')
                .ok_or_else(|| serde_json::Error::io(std::io::Error::other("missing object")))?;
            let end = trimmed
                .rfind('}')
                .ok_or_else(|| serde_json::Error::io(std::io::Error::other("missing object")))?;
            serde_json::from_str::<ReviewDocument>(&trimmed[start..=end])
        })
        .map_err(|_| "Agent result did not contain the required structured findings.")?;
    if parsed.findings.is_empty() || parsed.findings.len() > 3 {
        return Err("Agent result must contain one to three findings.".into());
    }
    for finding in &parsed.findings {
        if finding.finding.trim().is_empty()
            || finding.evidence.trim().is_empty()
            || finding.smallest_fix.trim().is_empty()
            || finding.files.is_empty()
            || !matches!(
                finding.severity.as_str(),
                "critical" | "high" | "medium" | "low"
            )
        {
            return Err("Agent result contains an invalid finding.".into());
        }
    }
    Ok(parsed)
}

fn bounded_review_prompt(user_prompt: &str) -> String {
    format!(
        "{}\nReview only the opened repository. Do not modify files, execute write commands, or access credentials. Return exactly one JSON object with a findings array of one to three items. Each item must contain finding, evidence, severity (critical|high|medium|low), smallestFix, and non-empty repository-relative files. Evidence must cite file:line. Do not wrap JSON in markdown.",
        user_prompt.trim()
    )
}

fn review_schema() -> &'static str {
    r#"{"type":"object","additionalProperties":false,"required":["findings"],"properties":{"findings":{"type":"array","minItems":1,"maxItems":3,"items":{"type":"object","additionalProperties":false,"required":["finding","evidence","severity","smallestFix","files"],"properties":{"finding":{"type":"string"},"evidence":{"type":"string"},"severity":{"enum":["critical","high","medium","low"]},"smallestFix":{"type":"string"},"files":{"type":"array","minItems":1,"items":{"type":"string"}}}}}}}"#
}

fn require_request_identity(request: &RunBackendRequest) -> Result<(), String> {
    if [
        request.backend_id.as_str(),
        request.task_id.as_str(),
        request.worker_run_id.as_str(),
        request.workspace.as_str(),
        request.prompt.as_str(),
    ]
    .iter()
    .any(|value| value.trim().is_empty())
    {
        return Err("Control-plane process request fields must be non-empty.".into());
    }
    Ok(())
}

fn configured_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).map(PathBuf::from)
}

fn configured_profile_dir() -> Option<PathBuf> {
    let home = configured_path("DSH_HOME")?;
    let profile = std::env::var("KERNIQ_DSH_PROFILE").unwrap_or_else(|_| "headless".into());
    Some(home.join("profiles").join(profile))
}

fn dump_dsh_profile(invocation: &EffectiveDshInvocation) -> Option<String> {
    let mut command = Command::new("node");
    command.arg(&invocation.entrypoint);
    let configuration_args = invocation.configuration_args();
    let arg_refs: Vec<&str> = configuration_args.iter().map(String::as_str).collect();
    command.args(&arg_refs).arg("--dump-config");
    configure_agent_environment(&mut command, true);
    let output = command.output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

fn command_text(executable: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(executable).args(args).output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn installed_agent_fuse_version(profile: &Path) -> Option<String> {
    let path = profile
        .join("node_modules")
        .join("@dhms-agentfuse")
        .join("dsh-agentfuse")
        .join("package.json");
    let package = serde_json::from_str::<Value>(&fs::read_to_string(path).ok()?).ok()?;
    if package.get("name").and_then(Value::as_str) != Some(AGENTFUSE_PACKAGE) {
        return None;
    }
    package
        .get("version")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

/// Enabled state of one plugin record in a DSH `--dump-config` document.
#[derive(Clone, Copy, PartialEq, Eq)]
enum PluginRecordState {
    Enabled,
    Disabled,
    Ambiguous,
}

/// Whether the plugin record named `package_name` is unambiguously enabled.
///
/// Top-level plugin records start with `- ` at column zero; their direct
/// fields sit on the following two-space-indented `key: value` lines until
/// the next column-zero line. A record is the target when exactly one direct
/// plain `name:` field equals `package_name`; a record claiming the target
/// name alongside another name fails closed. The target counts as available
/// only when every matching record is enabled: `disabled: true` disables the record, a
/// missing or `disabled: false` field leaves it enabled, and any other value
/// (YAML tag expressions such as `!!js`, unparseable text, or conflicting
/// duplicates) is ambiguous. A missing target, an ambiguous state, and
/// conflicting duplicates all fail closed.
fn dump_has_enabled_plugin(dump: &str, package_name: &str) -> bool {
    let mut matched = false;
    for record in plugin_records(dump) {
        if !record
            .name_fields
            .iter()
            .flatten()
            .any(|value| *value == package_name)
        {
            continue;
        }
        matched = true;
        // Exactly one direct `name:` field that resolved to one plain scalar
        // may identify the record; a second field — even an unparseable one —
        // makes the record ambiguous and fails closed.
        if record.name_fields.len() != 1 {
            return false;
        }
        if plugin_record_state(&record.disabled_values) != PluginRecordState::Enabled {
            return false;
        }
    }
    matched
}

/// Direct-field accounting for one top-level plugin record. Every syntactic
/// `name:` field is preserved — including values that fail plain-scalar
/// parsing — so a malformed or unresolved duplicate name can never be
/// silently dropped from the ambiguity check.
struct PluginRecord<'a> {
    name_fields: Vec<Option<&'a str>>,
    disabled_values: Vec<Option<&'a str>>,
}

/// Collect the direct `name:` and `disabled:` fields of every top-level
/// plugin record. Direct fields sit at exactly two spaces of indentation in
/// real audited DSH dumps; one or three-plus spaces are never direct fields.
fn plugin_records(dump: &str) -> Vec<PluginRecord<'_>> {
    let mut records = Vec::new();
    let mut record = PluginRecord {
        name_fields: Vec::new(),
        disabled_values: Vec::new(),
    };
    let mut in_record = false;
    for line in dump.lines() {
        if line.starts_with("- ") {
            if in_record {
                records.push(PluginRecord {
                    name_fields: std::mem::take(&mut record.name_fields),
                    disabled_values: std::mem::take(&mut record.disabled_values),
                });
            }
            in_record = true;
        } else if in_record {
            if line.starts_with("  ") && !line.starts_with("   ") {
                // Exactly two spaces: the record's direct field line.
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("name:") {
                    record.name_fields.push(yaml_plain_scalar(rest));
                } else if let Some(rest) = trimmed.strip_prefix("disabled:") {
                    record.disabled_values.push(yaml_plain_scalar(rest));
                }
                continue;
            }
            if line.starts_with(' ') {
                // One space, or three-plus: nested configuration (including
                // block-scalar content) and never a direct plugin field.
                continue;
            }
            // Real dumps contain blank lines inside plugin records (block
            // scalar values) and column-zero layer comments between them;
            // neither ends a record. Any other column-zero line does.
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            records.push(PluginRecord {
                name_fields: std::mem::take(&mut record.name_fields),
                disabled_values: std::mem::take(&mut record.disabled_values),
            });
            in_record = false;
        }
    }
    if in_record {
        records.push(record);
    }
    records
}

fn plugin_record_state(disabled_values: &[Option<&str>]) -> PluginRecordState {
    if disabled_values.is_empty() {
        return PluginRecordState::Enabled;
    }
    let mut saw_enabled = false;
    let mut saw_disabled = false;
    for value in disabled_values {
        match value {
            Some("false") => saw_enabled = true,
            Some("true") => saw_disabled = true,
            _ => return PluginRecordState::Ambiguous,
        }
    }
    if saw_enabled && saw_disabled {
        return PluginRecordState::Ambiguous;
    }
    if saw_disabled {
        return PluginRecordState::Disabled;
    }
    PluginRecordState::Enabled
}

fn governed_profile_is_product_ready(dump: &str, agent_fuse_available: bool) -> bool {
    agent_fuse_available && dump_has_enabled_plugin(dump, PRODUCTION_OBSERVER_PACKAGE)
}

fn dsh_default_model(dump: &str) -> (Option<String>, Option<String>) {
    let mut in_default_model = false;
    let mut in_config = false;
    let mut provider = None;
    let mut model = None;
    for line in dump.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("- id:") {
            if in_default_model {
                break;
            }
            in_default_model = trimmed == "- id: agent-default-model";
            in_config = false;
            continue;
        }
        if !in_default_model {
            continue;
        }
        if trimmed == "config:" {
            in_config = true;
            continue;
        }
        if !in_config {
            continue;
        }
        if let Some(value) = trimmed
            .strip_prefix("provider:")
            .and_then(yaml_plain_scalar)
        {
            provider = Some(value.to_string());
        } else if let Some(value) = trimmed.strip_prefix("model:").and_then(yaml_plain_scalar) {
            model = Some(value.to_string());
        }
    }
    (provider, model)
}

fn yaml_plain_scalar(value: &str) -> Option<&str> {
    let value = value.trim();
    if value.is_empty() || value.starts_with("!!") {
        return None;
    }
    Some(
        value
            .strip_prefix('\'')
            .and_then(|inner| inner.strip_suffix('\''))
            .or_else(|| {
                value
                    .strip_prefix('"')
                    .and_then(|inner| inner.strip_suffix('"'))
            })
            .unwrap_or(value),
    )
}

fn marker_contains(name: &str, call_id: &str) -> bool {
    configured_path(name)
        .and_then(|path| fs::read_to_string(path).ok())
        .is_some_and(|value| value.lines().any(|line| line.trim() == call_id))
}

fn target_matches_expected_content() -> bool {
    let Some(path) = configured_path("KERNIQ_DSH_TARGET_PATH") else {
        return false;
    };
    let Ok(expected) = std::env::var("KERNIQ_DSH_EXPECTED_CONTENT") else {
        return false;
    };
    target_content_matches(&path, &expected)
}

fn target_content_matches(path: &Path, expected: &str) -> bool {
    fs::read_to_string(path).is_ok_and(|value| value == format!("{expected}\n"))
}

fn canonical_policy_decision(value: &str) -> &'static str {
    match value {
        "allow" => "allow",
        "deny" | "block" => "block",
        "ask" => "ask",
        "error" | "error-deny" => "error-deny",
        _ => "unknown",
    }
}

fn observation(kind: &'static str, summary: impl Into<String>) -> AgentObservation {
    AgentObservation {
        kind,
        at: timestamp(),
        summary: summary.into(),
    }
}

fn timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{millis}")
}

fn temporary_token(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn sha256_reference(value: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(value))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_camel_case_and_legacy_smallest_fix() {
        for field in ["smallestFix", "smallest_fix"] {
            let raw = format!(
                "{{\"findings\":[{{\"finding\":\"Risk\",\"evidence\":\"src/a.ts:1\",\"severity\":\"low\",\"{field}\":\"Fix\",\"files\":[\"src/a.ts\"]}}]}}"
            );
            assert_eq!(parse_review_document(&raw).unwrap().findings.len(), 1);
        }
    }

    #[test]
    fn rejects_empty_findings() {
        assert!(parse_review_document("{\"findings\":[]}").is_err());
    }

    #[test]
    fn requires_exact_diagnostic_side_effect_content() {
        let path = std::env::temp_dir().join(format!(
            "kerniq-dsh-side-effect-{}",
            temporary_token("exact-content-test")
        ));
        fs::write(&path, "expected\n").unwrap();
        assert!(target_content_matches(&path, "expected"));
        assert!(!target_content_matches(&path, "different"));
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn normalizes_dsh_policy_decisions_at_the_adapter_boundary() {
        assert_eq!(canonical_policy_decision("deny"), "block");
        assert_eq!(canonical_policy_decision("allow"), "allow");
        assert_eq!(canonical_policy_decision("unexpected"), "unknown");
    }

    #[test]
    fn production_admission_rejects_the_validation_proof_as_an_observer() {
        let proof_only = r#"
- id: agentfuse
  name: '@dhms-agentfuse/dsh-agentfuse'
- id: kerniq-governance-proof
  name: '@kerniq/dsh-governance-proof'
"#;
        let production = format!(
            "{proof_only}\n- id: kerniq-control-plane-observer\n  name: '{PRODUCTION_OBSERVER_PACKAGE}'\n"
        );

        assert!(!governed_profile_is_product_ready(proof_only, true));
        assert!(governed_profile_is_product_ready(&production, true));
        assert!(!governed_profile_is_product_ready(&production, false));
    }

    #[test]
    fn enabled_plugin_detection_matrix() {
        let enabled = format!(
            "- id: kerniq-control-plane-observer\n  name: '{PRODUCTION_OBSERVER_PACKAGE}'\n"
        );
        let disabled_after_name = format!(
            "- id: kerniq-control-plane-observer\n  name: '{PRODUCTION_OBSERVER_PACKAGE}'\n  disabled: true\n"
        );
        // Real 0.1.2-alpha.1 dump shape: `disabled:` follows the whole
        // configuration block, not the `name:` line.
        let disabled_after_config = format!(
            "- id: agentfuse\n  name: '{AGENTFUSE_PACKAGE}'\n  config:\n    defaultAction: block\n    denyTools: []\n    allowTools:\n      - read\n    logDecisions: false\n  disabled: true\n"
        );
        let other_disabled_target_enabled = format!(
            "- id: timer\n  name: '@deepseek-ai/cordis-plugin-timer'\n  disabled: true\n- id: kerniq-control-plane-observer\n  name: '{PRODUCTION_OBSERVER_PACKAGE}'\n"
        );

        assert!(dump_has_enabled_plugin(&enabled, PRODUCTION_OBSERVER_PACKAGE));
        assert!(!dump_has_enabled_plugin(
            &disabled_after_name,
            PRODUCTION_OBSERVER_PACKAGE
        ));
        assert!(!dump_has_enabled_plugin(
            &disabled_after_config,
            AGENTFUSE_PACKAGE
        ));
        // A disabled sibling must not disable the target.
        assert!(dump_has_enabled_plugin(
            &other_disabled_target_enabled,
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // Missing target and unrelated packages stay unavailable.
        assert!(!dump_has_enabled_plugin(&enabled, "@kerniq/absent"));
        // `disabled: false` is an explicit enabled state.
        assert!(dump_has_enabled_plugin(
            &format!("{enabled}  disabled: false\n"),
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // Expression values cannot be resolved statically: fail closed.
        assert!(!dump_has_enabled_plugin(
            &format!("{enabled}  disabled: !!js process.platform === 'win32'\n"),
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // Malformed values fail closed.
        assert!(!dump_has_enabled_plugin(
            &format!("{enabled}  disabled: maybe\n"),
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // Nested `name:` keys (deeper indentation) never identify a plugin.
        assert!(!dump_has_enabled_plugin(
            &format!("- id: other\n  name: '@kerniq/other'\n  config:\n    name: '{PRODUCTION_OBSERVER_PACKAGE}'\n"),
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // A bare name line outside any plugin record does not count.
        assert!(!dump_has_enabled_plugin(
            &format!("  name: '{PRODUCTION_OBSERVER_PACKAGE}'\n"),
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // Duplicate targets: agreeing enabled records pass, conflicting
        // records fail closed.
        assert!(dump_has_enabled_plugin(&format!("{enabled}{enabled}"), PRODUCTION_OBSERVER_PACKAGE));
        assert!(!dump_has_enabled_plugin(
            &format!("{enabled}{disabled_after_name}"),
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // Duplicate `disabled` fields inside one record are parsed as one
        // conflicting state.
        assert!(!dump_has_enabled_plugin(
            &format!("{enabled}  disabled: false\n  disabled: true\n"),
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // Duplicate direct `name:` fields claiming the target are ambiguous,
        // including unparseable, empty, and value-identical duplicates.
        let target = PRODUCTION_OBSERVER_PACKAGE;
        for duplicate in [
            format!("- id: malformed\n  name: '{target}'\n  name: '@other/package'\n"),
            format!("- id: malformed\n  name: '{target}'\n  name: !!js process.env.PLUGIN\n"),
            format!("- id: malformed\n  name: '{target}'\n  name:\n"),
            format!("- id: malformed\n  name: '{target}'\n  name: '{target}'\n"),
        ] {
            assert!(
                !dump_has_enabled_plugin(&duplicate, target),
                "duplicate direct name must fail closed: {duplicate:?}"
            );
        }
        // Direct fields sit at exactly two spaces in real dumps; one-space
        // and three-plus-space name lines never identify a plugin.
        assert!(!dump_has_enabled_plugin(
            &format!("- id: observer\n name: '{target}'\n"),
            target
        ));
        assert!(!dump_has_enabled_plugin(
            &format!("- id: observer\n   name: '{target}'\n"),
            target
        ));
        assert!(dump_has_enabled_plugin(
            &format!("- id: observer\n  name: '{target}'\n"),
            target
        ));
        // Duplicate names on an unrelated record do not affect the target.
        assert!(dump_has_enabled_plugin(
            &format!(
                "- id: malformed\n  name: '@other/a'\n  name: '@other/b'\n{enabled}"
            ),
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // Real dumps contain blank lines inside records (block-scalar
        // values); a blank line must not separate `disabled:` from its
        // record.
        assert!(!dump_has_enabled_plugin(
            &format!(
                "- id: kerniq-control-plane-observer\n  name: '{PRODUCTION_OBSERVER_PACKAGE}'\n\n  disabled: true\n"
            ),
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // A sibling record with blank lines inside a block scalar leaves the
        // target record intact.
        assert!(dump_has_enabled_plugin(
            &format!(
                "- id: plan-rules\n  name: '@deepseek-ai/dsh-plan-rules'\n  config:\n    section: >\n      first paragraph\n\n      second paragraph\n{enabled}"
            ),
            PRODUCTION_OBSERVER_PACKAGE
        ));
        // A column-zero layer comment between records ends nothing.
        assert!(dump_has_enabled_plugin(
            &format!("- id: agentfuse\n  name: '{AGENTFUSE_PACKAGE}'\n# == layer comment\n{enabled}"),
            PRODUCTION_OBSERVER_PACKAGE
        ));
    }

    #[test]
    fn governed_profile_requires_an_enabled_observer() {
        let disabled = format!(
            "- id: agentfuse\n  name: '{AGENTFUSE_PACKAGE}'\n- id: kerniq-control-plane-observer\n  name: '{PRODUCTION_OBSERVER_PACKAGE}'\n  disabled: true\n"
        );
        assert!(!governed_profile_is_product_ready(&disabled, true));
    }

    #[test]
    fn admission_starts_with_all_gates_true_and_stops_only_on_disabled_observer() {
        let _guard = GOVERNANCE_ENV_LOCK.lock().unwrap();
        let fixture = admission_fixture();

        // Positive control: same runtime, revision, profile, adapter, and
        // evidence path as the negative case; only the observer record
        // differs. Every gate holds and the stub agent really starts.
        let entry = fixture.install_stub(&admission_dump(false, false));
        let positive = probe_dsh();
        assert!(positive.available);
        assert_governance_gates(positive.governance.as_ref().unwrap(), true, true, true, true);
        let output = run_dsh(test_request(), &fixture.workspace)
            .expect("all gates true must admit the governed run");
        assert!(agent_started(&entry), "stub agent did not start");
        assert_eq!(output.result.findings.len(), 1);
        clear_agent_marker(&entry);

        // Negative: the disabled observer is the only gate that flips.
        fixture.install_stub(&admission_dump(true, false));
        let negative = probe_dsh();
        assert_governance_gates(negative.governance.as_ref().unwrap(), true, true, false, false);
        let error = run_dsh(test_request(), &fixture.workspace).unwrap_err();
        assert_eq!(error, "Governed DSH admission failed before process start.");
        assert!(!agent_started(&entry));
    }

    #[test]
    fn admission_starts_with_all_gates_true_and_stops_only_on_disabled_agentfuse() {
        let _guard = GOVERNANCE_ENV_LOCK.lock().unwrap();
        let fixture = admission_fixture();

        // Positive control: identical environment, AgentFuse enabled.
        let entry = fixture.install_stub(&admission_dump(false, false));
        let positive = probe_dsh();
        assert_governance_gates(positive.governance.as_ref().unwrap(), true, true, true, true);
        let output = run_dsh(test_request(), &fixture.workspace)
            .expect("all gates true must admit the governed run");
        assert!(agent_started(&entry));
        assert_eq!(output.result.findings.len(), 1);
        clear_agent_marker(&entry);

        // Negative: the disabled AgentFuse record is the only gate that
        // flips; the observer stays available.
        fixture.install_stub(&admission_dump(false, true));
        let negative = probe_dsh();
        assert_governance_gates(negative.governance.as_ref().unwrap(), true, false, true, false);
        let error = run_dsh(test_request(), &fixture.workspace).unwrap_err();
        assert_eq!(error, "Governed DSH admission failed before process start.");
        assert!(!agent_started(&entry));
    }

    #[test]
    fn admission_dump_applies_the_product_patch_and_refuses_disabled_governance() {
        let _guard = GOVERNANCE_ENV_LOCK.lock().unwrap();
        let fixture = admission_fixture();
        let entry = fixture.install_stub(&admission_dump(false, false));

        // Positive control: no product patch, all gates hold, agent starts.
        assert_governance_gates(probe_dsh().governance.as_ref().unwrap(), true, true, true, true);
        run_dsh(test_request(), &fixture.workspace)
            .expect("no-patch positive control must admit the governed run");
        assert!(agent_started(&entry));
        clear_agent_marker(&entry);

        // Product patch disables the observer: the admission dump itself must
        // reflect the effective configuration and refuse the run.
        let observer_patch = fixture.root.join("disable-observer.patch.yml");
        fs::write(&observer_patch, "- id: kerniq-control-plane-observer\n  disabled: true\n")
            .unwrap();
        fixture.set_product_patch(&observer_patch);
        assert_governance_gates(
            probe_dsh().governance.as_ref().unwrap(),
            true,
            true,
            false,
            false,
        );
        let error = run_dsh(test_request(), &fixture.workspace).unwrap_err();
        assert_eq!(error, "Governed DSH admission failed before process start.");
        assert!(!agent_started(&entry));
        fixture.env.clear("KERNIQ_DSH_PRODUCT_PATCH");

        // Product patch disables AgentFuse: same refusal, only the adapter
        // gates flip.
        let agentfuse_patch = fixture.root.join("disable-agentfuse.patch.yml");
        fs::write(&agentfuse_patch, "- id: agentfuse\n  disabled: true\n").unwrap();
        fixture.set_product_patch(&agentfuse_patch);
        assert_governance_gates(
            probe_dsh().governance.as_ref().unwrap(),
            true,
            false,
            true,
            false,
        );
        let error = run_dsh(test_request(), &fixture.workspace).unwrap_err();
        assert_eq!(error, "Governed DSH admission failed before process start.");
        assert!(!agent_started(&entry));
        fixture.env.clear("KERNIQ_DSH_PRODUCT_PATCH");

        // A configured patch that cannot be resolved fails the dump itself,
        // and governed admission fails closed without a patch-free fallback.
        fixture.set_product_patch(&fixture.root.join("missing.patch.yml"));
        let broken = probe_dsh().governance.as_ref().unwrap().clone();
        assert!(!broken.agent_fuse_adapter_available);
        assert!(!broken.production_observer_available);
        assert!(!broken.governed_profile_valid);
        let error = run_dsh(test_request(), &fixture.workspace).unwrap_err();
        assert_eq!(error, "Governed DSH admission failed before process start.");
        assert!(!agent_started(&entry));
    }

    #[test]
    fn foreign_same_version_entrypoint_cannot_borrow_the_audited_root() {
        let _guard = GOVERNANCE_ENV_LOCK.lock().unwrap();
        let fixture = admission_fixture();
        // The audited slot holds a stub that would report the correct version
        // and an enabled dump, but it must never be reached through the
        // adversary's entrypoint.
        fixture.install_stub(&admission_dump(false, false));

        // Adversary: a foreign entrypoint outside the audited checkout that
        // also reports the audited version with a clean dump.
        let foreign = fixture.root.join("foreign-bin.mjs");
        write_dsh_stub(&foreign, &admission_dump(false, false));
        fixture.set_entrypoint(&foreign);
        let probe = probe_dsh();
        assert!(!probe.available, "foreign entrypoint must not resolve");
        let governance = probe.governance.as_ref().unwrap();
        assert!(!governance.compatible_runtime);
        assert!(!governance.agent_fuse_adapter_available);
        assert!(!governance.production_observer_available);
        let error = run_dsh(test_request(), &fixture.workspace).unwrap_err();
        assert_eq!(error, "Governed DSH admission failed before process start.");
        assert!(!agent_started(&fixture.entrypoint));
        let _ = fs::remove_file(foreign.with_file_name("agent-started-marker"));

        // Unresolved runtime identity (missing root) also fails closed.
        fixture.env.clear("KERNIQ_DSH_RUNTIME_ENTRYPOINT");
        fixture.env.set(
            "KERNIQ_DSH_RUNTIME_ROOT",
            fixture.root.join("absent-root").to_string_lossy().as_ref(),
        );
        let missing = probe_dsh();
        assert!(!missing.available);
        assert!(!missing.governance.as_ref().unwrap().compatible_runtime);
        let error = run_dsh(test_request(), &fixture.workspace).unwrap_err();
        assert_eq!(error, "Governed DSH admission failed before process start.");
    }

    #[test]
    fn effective_invocation_shares_configuration_arguments() {
        let _guard = GOVERNANCE_ENV_LOCK.lock().unwrap();
        let fixture = admission_fixture();
        fixture.install_stub(&admission_dump(false, false));
        let patch = fixture.root.join("product.patch.yml");
        fs::write(&patch, "[]\n").unwrap();
        fixture.set_product_patch(&patch);

        let invocation = EffectiveDshInvocation::from_environment()
            .expect("canonical fixture must resolve its invocation");
        // The dump-config invocation and the runtime invocation both build
        // from this one argument vector: profile and patch are shared.
        assert_eq!(
            invocation.configuration_args(),
            vec![
                "--profile".to_string(),
                "headless".to_string(),
                "--patch".to_string(),
                patch.to_string_lossy().into_owned(),
            ]
        );
    }

    /// Test-wide lock: probe_dsh/run_dsh read process environment variables,
    /// so tests that mutate them must not run concurrently.
    static GOVERNANCE_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// Hermetic admission environment: installed adapter metadata, evidence
    /// capture, an audited-shape runtime root whose canonical CLI slot holds
    /// the stub entrypoint, and the audited revision provided through the
    /// test-only seam in `dsh_runtime_revision`. Cases differ only in the
    /// stub's embedded dump and the optional product patch.
    struct AdmissionFixture {
        root: PathBuf,
        workspace: PathBuf,
        entrypoint: PathBuf,
        env: ScopedEnv,
    }

    fn admission_fixture() -> AdmissionFixture {
        let root = std::env::temp_dir().join(format!(
            "kerniq-disabled-plugin-admission-{}",
            temporary_token("admission-test")
        ));
        let env = ScopedEnv::capture();
        env.set("KERNIQ_DSH_PROFILE", "headless");

        let adapter = root
            .join("dsh-home")
            .join("profiles")
            .join("headless")
            .join("node_modules")
            .join("@dhms-agentfuse")
            .join("dsh-agentfuse");
        fs::create_dir_all(&adapter).unwrap();
        fs::write(
            adapter.join("package.json"),
            format!("{{\"name\":\"{AGENTFUSE_PACKAGE}\",\"version\":\"0.2.1\"}}"),
        )
        .unwrap();
        let evidence = root.join("evidence");
        fs::create_dir_all(&evidence).unwrap();
        env.set("DSH_HOME", root.join("dsh-home").to_string_lossy().as_ref());
        env.set(
            "KERNIQ_DSH_EVIDENCE_PATH",
            evidence.join("events.jsonl").to_string_lossy().as_ref(),
        );

        let git_root = root.join("runtime-root");
        fs::create_dir_all(&git_root).unwrap();
        env.set(
            "KERNIQ_DSH_RUNTIME_ROOT",
            git_root.to_string_lossy().as_ref(),
        );
        // The audited revision is represented through the test-only seam so
        // `compatible_runtime=true` holds hermetically; release builds never
        // read this variable.
        env.set("KERNIQ_TEST_DSH_REVISION", AUDITED_DSH_REVISION);

        let workspace = root.join("workspace");
        fs::create_dir_all(&workspace).unwrap();
        AdmissionFixture {
            root,
            workspace,
            entrypoint: git_root
                .join("apps")
                .join("cli")
                .join("lib")
                .join("bin.js"),
            env,
        }
    }

    impl AdmissionFixture {
        /// Installs the stub DSH entrypoint into the canonical audited CLI
        /// slot under the runtime root.
        fn install_stub(&self, dump: &str) -> PathBuf {
            fs::create_dir_all(self.entrypoint.parent().unwrap()).unwrap();
            write_dsh_stub(&self.entrypoint, dump);
            self.set_entrypoint(&self.entrypoint);
            self.entrypoint.clone()
        }

        fn set_entrypoint(&self, entry: &Path) {
            self.env
                .set("KERNIQ_DSH_RUNTIME_ENTRYPOINT", entry.to_string_lossy().as_ref());
        }

        fn set_product_patch(&self, patch: &Path) {
            self.env
                .set("KERNIQ_DSH_PRODUCT_PATCH", patch.to_string_lossy().as_ref());
        }
    }

    /// A minimal composed profile dump whose plugin records are enabled or
    /// disabled per flag. The AgentFuse record carries `disabled:` after its
    /// configuration block and the observer record after its `name:`, mirroring
    /// the real 0.1.2-alpha.1 dump shapes.
    fn admission_dump(observer_disabled: bool, agentfuse_disabled: bool) -> String {
        let mut dump = format!(
            "# == profile layer\n- id: agentfuse\n  name: '{AGENTFUSE_PACKAGE}'\n  config:\n    defaultAction: block\n    logDecisions: false\n"
        );
        if agentfuse_disabled {
            dump.push_str("  disabled: true\n");
        }
        dump.push_str(&format!(
            "- id: kerniq-control-plane-observer\n  name: '{PRODUCTION_OBSERVER_PACKAGE}'\n"
        ));
        if observer_disabled {
            dump.push_str("  disabled: true\n");
        }
        dump
    }

    /// Asserts the full governance gate accounting for one admission case.
    /// `pre_dispatch_seam_available` tracks `compatible_runtime` and
    /// `evidence_capture_available` always holds in the fixture, so the
    /// expected values pin exactly which gates are true.
    fn assert_governance_gates(
        governance: &DshGovernanceProbe,
        compatible_runtime: bool,
        agent_fuse_adapter_available: bool,
        production_observer_available: bool,
        governed_profile_valid: bool,
    ) {
        assert_eq!(governance.compatible_runtime, compatible_runtime);
        assert_eq!(
            governance.agent_fuse_adapter_available,
            agent_fuse_adapter_available
        );
        assert_eq!(
            governance.pre_dispatch_seam_available,
            compatible_runtime
        );
        assert_eq!(
            governance.production_observer_available,
            production_observer_available
        );
        assert_eq!(governance.governed_profile_valid, governed_profile_valid);
        assert!(governance.evidence_capture_available);
    }

    fn agent_started(entry: &Path) -> bool {
        entry.with_file_name("agent-started-marker").exists()
    }

    fn clear_agent_marker(entry: &Path) {
        let _ = fs::remove_file(entry.with_file_name("agent-started-marker"));
    }

    /// Writes a stub DSH entrypoint at `path`. It answers `--version` with
    /// the audited version; for `--dump-config` it prints the base dump and,
    /// when a product patch is configured, applies the patch's
    /// `- id: X / disabled: true` rows to the matching records — failing when
    /// the patch file is missing, like the real CLI; when invoked as an agent
    /// it records a marker file and returns the minimum structured result
    /// `run_dsh` expects.
    fn write_dsh_stub(path: &Path, dump: &str) {
        fs::write(
            path,
            format!(
                r#"const {{ writeFileSync, readFileSync, existsSync }} = require('node:fs');
const {{ join }} = require('node:path');
const args = process.argv.slice(2);
const base = {dump:?};
if (args.includes('--version')) {{
  console.log('{AUDITED_DSH_VERSION}');
}} else if (args.includes('--dump-config')) {{
  let effective = base;
  const patchIndex = args.indexOf('--patch');
  if (patchIndex !== -1) {{
    const patchPath = args[patchIndex + 1];
    if (!existsSync(patchPath)) {{ console.error('patch not found'); process.exit(1); }}
    const plines = readFileSync(patchPath, 'utf8').split(/\r?\n/);
    const disabledIds = [];
    for (let i = 0; i < plines.length; i++) {{
      const m = (plines[i] || '').match(/^-\s*id:\s*(\S+)/);
      if (m && /^\s+disabled:\s*true\s*$/.test(plines[i + 1] || '')) disabledIds.push(m[1]);
    }}
    if (disabledIds.length) {{
      const dl = base.split('\n');
      const out = [];
      for (let i = 0; i < dl.length; i++) {{
        out.push(dl[i]);
        const m = (dl[i] || '').match(/^-\s*id:\s*(\S+)/);
        if (m && disabledIds.includes(m[1]) && (dl[i + 1] || '').startsWith('  name:')) {{
          out.push(dl[i + 1]);
          out.push('  disabled: true');
          i++;
        }}
      }}
      effective = out.join('\n');
    }}
  }}
  console.log(effective);
}} else {{
  writeFileSync(join(__dirname, 'agent-started-marker'), 'started');
  console.log(JSON.stringify({{findings:[{{finding:'stub governed run completed',evidence:'stub.mjs:1',severity:'low',smallestFix:'none',files:['stub.mjs']}}]}}));
}}
"#
            ),
        )
        .unwrap();
    }

    /// Saves and restores the process environment around a test.
    struct ScopedEnv {
        saved: Vec<(String, Option<std::ffi::OsString>)>,
    }

    impl ScopedEnv {
        fn capture() -> Self {
            let names = [
                "KERNIQ_DSH_PROFILE",
                "DSH_HOME",
                "KERNIQ_DSH_EVIDENCE_PATH",
                "KERNIQ_DSH_RUNTIME_ROOT",
                "KERNIQ_DSH_RUNTIME_ENTRYPOINT",
                "KERNIQ_DSH_PRODUCT_PATCH",
                "KERNIQ_TEST_DSH_REVISION",
            ];
            ScopedEnv {
                saved: names
                    .iter()
                    .map(|name| (name.to_string(), std::env::var_os(name)))
                    .collect(),
            }
        }

        fn set(&self, name: &str, value: &str) {
            std::env::set_var(name, value);
        }

        fn clear(&self, name: &str) {
            std::env::remove_var(name);
        }
    }

    impl Drop for ScopedEnv {
        fn drop(&mut self) {
            for (name, value) in self.saved.drain(..) {
                match value {
                    Some(value) => std::env::set_var(&name, value),
                    None => std::env::remove_var(&name),
                }
            }
        }
    }

    #[test]
    fn resolves_model_and_provider_from_the_admitted_profile_dump() {
        let dump = r#"
- id: agent-default-model
  name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: provider-from-profile
    model: 'model-from-profile'
- id: next
  name: next
"#;

        assert_eq!(
            dsh_default_model(dump),
            (
                Some("provider-from-profile".into()),
                Some("model-from-profile".into())
            )
        );
        assert_eq!(
            dsh_default_model(
                "- id: agent-default-model\n  config:\n    model: !!js process.env.MODEL"
            ),
            (None, None)
        );
    }

    #[test]
    fn resolves_agentfuse_version_from_installed_package_metadata() {
        let root = std::env::temp_dir().join(format!(
            "kerniq-agentfuse-version-{}",
            temporary_token("package-metadata-test")
        ));
        let package_dir = root
            .join("node_modules")
            .join("@dhms-agentfuse")
            .join("dsh-agentfuse");
        fs::create_dir_all(&package_dir).unwrap();
        fs::write(
            package_dir.join("package.json"),
            r#"{"name":"@dhms-agentfuse/dsh-agentfuse","version":"9.8.7"}"#,
        )
        .unwrap();

        assert_eq!(
            installed_agent_fuse_version(&root).as_deref(),
            Some("9.8.7")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn keeps_model_request_provenance_independent_from_pre_execute() {
        let request = test_request();
        let probe = test_dsh_probe();
        let events = vec![
            test_governance_event("model_request", "call-observed", "read", None),
            test_governance_event("pre_execute", "call-observed", "read", Some("allow")),
            test_governance_event("result", "call-observed", "read", None),
            test_governance_event("pre_execute", "call-unknown", "read", Some("deny")),
            test_governance_event("result", "call-unknown", "read", None),
        ];

        let evidence = governance_evidence_inputs(&request, &probe, events);
        assert_eq!(evidence.len(), 2);
        assert!(evidence
            .iter()
            .all(|item| item.get("outcome") == Some(&Value::String("unknown".into()))));
        assert_eq!(
            evidence[0].pointer("/modelToolCallObserved/value"),
            Some(&Value::Bool(true))
        );
        assert_eq!(
            evidence[1].pointer("/modelToolCallObserved/value"),
            Some(&Value::String("unknown".into()))
        );
        assert_eq!(
            evidence[0].pointer("/provenance/modelProvider"),
            Some(&Value::String("provider-from-profile".into()))
        );
        assert_eq!(
            evidence[0].pointer("/provenance/policyAdapter"),
            Some(&Value::String(format!("{AGENTFUSE_PACKAGE}@9.8.7")))
        );
    }

    fn test_request() -> RunBackendRequest {
        RunBackendRequest {
            backend_id: "dsh-deepseek".into(),
            task_id: "task-test".into(),
            worker_run_id: "worker-test".into(),
            workspace: "/tmp/project".into(),
            prompt: "Review".into(),
            governance_required: true,
        }
    }

    fn test_dsh_probe() -> AgentRuntimeProbe {
        AgentRuntimeProbe {
            available: true,
            version: AUDITED_DSH_VERSION.into(),
            model: Some("model-from-profile".into()),
            supports_streaming: false,
            supports_cancel: false,
            supports_tool_events: true,
            supports_resume: false,
            runtime_revision: Some(AUDITED_DSH_REVISION.into()),
            provider_route: Some("provider-from-profile".into()),
            governance: Some(DshGovernanceProbe {
                mode: "pre_dispatch_plugin",
                compatible_runtime: true,
                agent_fuse_adapter_available: true,
                agent_fuse_version: Some("9.8.7".into()),
                pre_dispatch_seam_available: true,
                production_observer_available: true,
                governed_profile_valid: true,
                evidence_capture_available: true,
            }),
        }
    }

    fn test_governance_event(
        phase: &str,
        call_id: &str,
        tool_name: &str,
        decision: Option<&str>,
    ) -> GovernanceEvent {
        GovernanceEvent {
            phase: phase.into(),
            tool_call_id: call_id.into(),
            tool_name: tool_name.into(),
            decision: decision.map(str::to_string),
        }
    }
}
