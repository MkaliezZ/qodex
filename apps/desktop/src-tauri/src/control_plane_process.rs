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
    pre_dispatch_seam_available: bool,
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
    pre_execute: bool,
    decision: Option<String>,
    dispatch: bool,
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
        supports_streaming: true,
        supports_cancel: false,
        supports_tool_events: true,
        supports_resume: false,
        runtime_revision: None,
        provider_route: None,
        governance: None,
    }
}

fn probe_dsh() -> AgentRuntimeProbe {
    let entrypoint = configured_path("KERNIQ_DSH_RUNTIME_ENTRYPOINT");
    let root = configured_path("KERNIQ_DSH_RUNTIME_ROOT");
    let runtime_available = entrypoint.as_ref().is_some_and(|path| path.is_file());
    let version = entrypoint
        .as_ref()
        .filter(|_| runtime_available)
        .and_then(|path| command_text("node", &[path.to_string_lossy().as_ref(), "--version"]))
        .unwrap_or_else(|| "unavailable".into());
    let revision = root.as_ref().and_then(|path| {
        command_text(
            "git",
            &["-C", path.to_string_lossy().as_ref(), "rev-parse", "HEAD"],
        )
    });
    let compatible_runtime =
        version == AUDITED_DSH_VERSION && revision.as_deref() == Some(AUDITED_DSH_REVISION);
    let profile = configured_profile_dir();
    let package_text = profile
        .as_ref()
        .and_then(|path| fs::read_to_string(path.join("package.json")).ok())
        .unwrap_or_default();
    let agent_fuse_adapter_available = package_text.contains(AGENTFUSE_PACKAGE);
    let dump = entrypoint.as_ref().and_then(|path| dump_dsh_profile(path));
    let pre_dispatch_seam_available = compatible_runtime;
    let governed_profile_valid = dump.as_ref().is_some_and(|value| {
        value.contains(AGENTFUSE_PACKAGE)
            && (value.contains("kerniq-governance-proof")
                || value.contains("kerniq-control-plane-observer"))
    });
    let evidence_capture_available = configured_path("KERNIQ_DSH_EVIDENCE_PATH")
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .is_some_and(|parent| parent.is_dir());

    AgentRuntimeProbe {
        available: runtime_available,
        version,
        model: Some("deepseek-v4-flash".into()),
        supports_streaming: true,
        supports_cancel: false,
        supports_tool_events: true,
        supports_resume: false,
        runtime_revision: revision,
        provider_route: Some("deepseek-official".into()),
        governance: Some(DshGovernanceProbe {
            mode: "pre_dispatch_plugin",
            compatible_runtime,
            agent_fuse_adapter_available,
            pre_dispatch_seam_available,
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
        && governance.governed_profile_valid
        && governance.evidence_capture_available;
    if request.governance_required && !governed {
        return Err("Governed DSH admission failed before process start.".into());
    }
    if !probe.available {
        return Err("DeepSeek Harness backend is unavailable.".into());
    }
    let entrypoint = configured_path("KERNIQ_DSH_RUNTIME_ENTRYPOINT")
        .ok_or("DeepSeek Harness runtime entrypoint is not configured.")?;
    let evidence_path = configured_path("KERNIQ_DSH_EVIDENCE_PATH")
        .ok_or("DeepSeek Harness evidence capture is not configured.")?;
    fs::write(&evidence_path, b"")
        .map_err(|_| "DeepSeek Harness evidence capture could not be initialized.")?;
    let profile = std::env::var("KERNIQ_DSH_PROFILE").unwrap_or_else(|_| "headless".into());
    let prompt = bounded_review_prompt(&request.prompt);
    let mut command = Command::new("node");
    command.arg(entrypoint).args(["--profile", &profile]);
    if let Some(patch) = configured_path("KERNIQ_DSH_PRODUCT_PATCH") {
        command.args(["--patch", patch.to_string_lossy().as_ref()]);
    }
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
            "pre_execute" => {
                call.pre_execute = true;
                if let Some(decision) = event.decision {
                    call.decision = Some(canonical_policy_decision(&decision).into());
                }
            }
            "dispatch" => call.dispatch = true,
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
            let outcome = match decision.as_str() {
                "block" if !call.dispatch && !body_started && !side_effect => "blocked",
                "allow" if call.dispatch && body_started && side_effect => "succeeded",
                "ask" if !call.dispatch && !body_started && !side_effect => "failed_closed",
                "error-deny" if !call.dispatch && !body_started && !side_effect => "failed_closed",
                _ => "unknown",
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
                "modelToolCallObserved": { "value": true, "provenance": "observed" },
                "policyDecision": { "value": decision, "provenance": "observed" },
                "policyReason": reason,
                "preExecuteObserved": { "value": call.pre_execute, "provenance": "observed" },
                "dispatchOccurred": { "value": call.dispatch, "provenance": "observed" },
                "toolBodyStarted": { "value": body_value, "provenance": body_provenance },
                "physicalSideEffect": { "value": effect_value, "provenance": effect_provenance },
                "outcome": outcome,
                "provenance": {
                    "runtimeSource": format!("deepseek-ai/deepseek-harness@{}", probe.runtime_revision.as_deref().unwrap_or("unknown")),
                    "modelProvider": "deepseek-official",
                    "model": probe.model.as_deref().unwrap_or("unknown"),
                    "policyAdapter": "@dhms-agentfuse/dsh-agentfuse@0.2.1",
                    "captureMethod": "configured pre-execute and dispatch observer with bounded diagnostic markers"
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

fn dump_dsh_profile(entrypoint: &Path) -> Option<String> {
    let profile = std::env::var("KERNIQ_DSH_PROFILE").unwrap_or_else(|_| "headless".into());
    let mut command = Command::new("node");
    command
        .arg(entrypoint)
        .args(["--profile", &profile, "--dump-config"]);
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
}
