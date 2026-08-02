use super::*;
use crate::coding_pack_export::{
    validate_manifest, write_atomic_bundle, write_atomic_bundle_with_fault, ExportFault,
    NativeBundleWriteOutcome, NativeExportRequest,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::Write;
use std::process::{Command, Stdio};

const PROOF_ENABLE: &str = "KERNIQ_RUN_V0_7_4_4_NATIVE_EXPORT_PROOF";
const PROOF_ROOT: &str = "KERNIQ_V0_7_4_4_PROOF_ROOT";
const PROOF_PROJECT: &str = "KERNIQ_V0_7_4_4_PROJECT";
const PROOF_MANIFEST: &str = "KERNIQ_V0_7_4_4_MANIFEST";
const PROOF_SELECTION: &str = "KERNIQ_V0_7_4_4_SELECTION";
const PROOF_PROFILE: &str = "KERNIQ_V0_7_4_4_MANAGED_PROFILE";
const PROOF_OUTPUT: &str = "KERNIQ_V0_7_4_4_EVIDENCE_OUTPUT";
const PROOF_COMMIT: &str = "KERNIQ_V0_7_4_4_REPOSITORY_COMMIT";
const PROOF_OS_VERSION: &str = "KERNIQ_V0_7_4_4_OS_VERSION";
const PROOF_SOURCE_ARCHIVE_SHA256: &str = "KERNIQ_V0_7_4_4_SOURCE_ARCHIVE_SHA256";

struct ProofCase {
    database: CodingPackDatabase,
    project: PathBuf,
    destination: PathBuf,
    request: NativeExportRequest,
    manifest_json: String,
}

#[derive(Debug)]
struct RealDecision {
    request: Value,
    request_digest: String,
    response: Value,
    handshake: Value,
}

#[test]
#[ignore = "runs the controlled real managed-AgentFuse and native filesystem proof"]
fn controlled_real_native_export_proof() {
    assert_eq!(std::env::var(PROOF_ENABLE).as_deref(), Ok("1"));
    assert_eq!(std::env::consts::OS, "macos");

    let proof_root = required_path(PROOF_ROOT);
    let fixture_project = required_path(PROOF_PROJECT);
    let manifest_path = required_path(PROOF_MANIFEST);
    let selection_path = required_path(PROOF_SELECTION);
    let managed_profile = required_path(PROOF_PROFILE);
    let evidence_output = required_path(PROOF_OUTPUT);
    let repository_commit = required_text(PROOF_COMMIT);
    let os_version = required_text(PROOF_OS_VERSION);
    let source_archive_sha256 = required_text(PROOF_SOURCE_ARCHIVE_SHA256);
    assert!(source_archive_sha256.len() == 64);
    assert!(proof_root
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.starts_with("kerniq_v0_7_4_4_native_export_proof.")));
    assert!(fixture_project.starts_with(&proof_root));
    assert!(managed_profile.starts_with(&proof_root));
    assert!(manifest_path.starts_with(&proof_root));
    assert!(selection_path.starts_with(&proof_root));
    assert!(fixture_project.join("src/main.ts").is_file());
    assert!(fixture_project.join("src/utils.ts").is_file());
    assert!(fixture_project.join("README.md").is_file());
    assert!(fixture_project.join(".env").is_file());
    assert!(fixture_project.join("notes.bin").is_file());

    let manifest_json = fs::read_to_string(&manifest_path).unwrap();
    let selection_evidence: Value =
        serde_json::from_str(&fs::read_to_string(&selection_path).unwrap()).unwrap();
    assert_eq!(
        selection_evidence["readRequiredPaths"],
        json!(["README.md", "src/main.ts", "src/utils.ts"])
    );
    assert_eq!(
        selection_evidence["excludedBeforeReadPaths"],
        json!([".env", "notes.bin"])
    );
    let manifest_value: Value = serde_json::from_str(&manifest_json).unwrap();
    let validated_manifest = validate_manifest(&manifest_json).unwrap();
    assert_eq!(
        validated_manifest
            .sources
            .iter()
            .map(|source| source.relative_path.as_str())
            .collect::<Vec<_>>(),
        ["README.md", "src/main.ts", "src/utils.ts"]
    );
    let excluded_paths = manifest_value["exclusions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["relativePath"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert!(excluded_paths.contains(&".env"));
    assert!(excluded_paths.contains(&"notes.bin"));

    let cases_root = proof_root.join("native-cases");
    fs::create_dir(&cases_root).unwrap();

    let positive = prepare_case(&cases_root, "positive", &fixture_project, &manifest_json);
    let positive_decision = evaluate_real_allow(&positive, &managed_profile, "positive");
    append_real_decision(&positive, &positive_decision, "allow");
    let positive_prepared = positive
        .database
        .begin_native_export(&positive.request, &positive.project)
        .unwrap();
    let started = positive
        .database
        .get_operation_snapshot_data(&positive.request.operation_id)
        .unwrap()
        .unwrap();
    assert!(positive_prepared
        .plan
        .destination_object_identity_digest
        .starts_with("sha256:"));
    assert_eq!(started.operation.state, "export_started");
    assert_eq!(
        event_types(&started),
        [
            "PACK_PROPOSED",
            "PACK_CONFIRMED",
            "PACK_DECIDED",
            "PACK_EXPORT_STARTED",
        ]
    );
    assert_eq!(
        write_atomic_bundle(&positive_prepared),
        NativeBundleWriteOutcome::PromotedAndSynced
    );
    let completed_at = positive
        .database
        .record_native_export_completed(&positive_prepared.plan)
        .unwrap();
    let completed = positive
        .database
        .get_operation_snapshot_data(&positive.request.operation_id)
        .unwrap()
        .unwrap();
    assert_eq!(completed.operation.state, "export_completed");
    assert_eq!(
        event_types(&completed),
        [
            "PACK_PROPOSED",
            "PACK_CONFIRMED",
            "PACK_DECIDED",
            "PACK_EXPORT_STARTED",
            "PACK_EXPORT_COMPLETED",
        ]
    );
    let positive_target = positive
        .destination
        .join(&positive_prepared.plan.target_name);
    let exported_file_digests =
        verify_exported_bundle(&positive_target, &positive.project, &positive.manifest_json);
    assert!(no_staging_entries(&positive.destination));
    assert!(sqlite_header_is_real(
        &cases_root.join("positive/store.sqlite3")
    ));

    let existing = prepare_case(
        &cases_root,
        "existing-target",
        &fixture_project,
        &manifest_json,
    );
    let existing_decision = evaluate_real_allow(&existing, &managed_profile, "existing-target");
    append_real_decision(&existing, &existing_decision, "allow");
    let existing_target = existing.destination.join(format!(
        "kerniq-coding-pack-{}",
        &validated_manifest.manifest_digest["sha256:".len()..]
    ));
    fs::create_dir(&existing_target).unwrap();
    fs::write(existing_target.join("untouched"), b"existing-target\n").unwrap();
    assert_eq!(
        existing
            .database
            .begin_native_export(&existing.request, &existing.project)
            .unwrap_err(),
        "coding_pack_export_target_exists"
    );
    assert_eq!(
        fs::read(existing_target.join("untouched")).unwrap(),
        b"existing-target\n"
    );
    assert_case_not_started(&existing);
    assert!(no_staging_entries(&existing.destination));

    let drift = prepare_case(
        &cases_root,
        "source-drift",
        &fixture_project,
        &manifest_json,
    );
    let drift_decision = evaluate_real_allow(&drift, &managed_profile, "source-drift");
    append_real_decision(&drift, &drift_decision, "allow");
    fs::write(
        drift.project.join("src/utils.ts"),
        b"export const drift = true;\n",
    )
    .unwrap();
    assert_eq!(
        drift
            .database
            .begin_native_export(&drift.request, &drift.project)
            .unwrap_err(),
        "coding_pack_source_changed_before_export"
    );
    assert_case_not_started(&drift);
    assert_eq!(fs::read_dir(&drift.destination).unwrap().count(), 0);

    let deny = prepare_case(&cases_root, "policy-deny", &fixture_project, &manifest_json);
    let deny_proof = evaluate_real_invalid_block(&deny, &managed_profile, "policy-deny");
    assert_eq!(deny_proof.response["decision"], "block");
    append_controlled_durable_deny(&deny, &deny_proof);
    let deny_snapshot = deny
        .database
        .get_operation_snapshot_data(&deny.request.operation_id)
        .unwrap()
        .unwrap();
    assert_eq!(deny_snapshot.operation.state, "decided_deny");
    assert_eq!(deny_snapshot.events[2].event_type, "PACK_DECIDED");
    assert_eq!(fs::read_dir(&deny.destination).unwrap().count(), 0);

    let unavailable = prepare_case(
        &cases_root,
        "destination-unavailable",
        &fixture_project,
        &manifest_json,
    );
    let unavailable_decision =
        evaluate_real_allow(&unavailable, &managed_profile, "destination-unavailable");
    append_real_decision(&unavailable, &unavailable_decision, "allow");
    fs::remove_dir(&unavailable.destination).unwrap();
    assert_eq!(
        unavailable
            .database
            .begin_native_export(&unavailable.request, &unavailable.project)
            .unwrap_err(),
        "coding_pack_destination_unavailable"
    );
    assert_case_not_started(&unavailable);

    let rebind = prepare_case(
        &cases_root,
        "destination-rebind",
        &fixture_project,
        &manifest_json,
    );
    let rebind_decision = evaluate_real_allow(&rebind, &managed_profile, "destination-rebind");
    append_real_decision(&rebind, &rebind_decision, "allow");
    let rebind_prepared = rebind
        .database
        .begin_native_export(&rebind.request, &rebind.project)
        .unwrap();
    let moved_destination = cases_root.join("destination-rebind-original-object");
    fs::rename(&rebind.destination, &moved_destination).unwrap();
    fs::create_dir(&rebind.destination).unwrap();
    assert_eq!(
        write_atomic_bundle(&rebind_prepared),
        NativeBundleWriteOutcome::PromotedAndSynced
    );
    rebind
        .database
        .record_native_export_completed(&rebind_prepared.plan)
        .unwrap();
    assert!(moved_destination
        .join(&rebind_prepared.plan.target_name)
        .is_dir());
    assert_eq!(fs::read_dir(&rebind.destination).unwrap().count(), 0);

    let completion_uncertain = prepare_case(
        &cases_root,
        "completion-persistence-uncertain",
        &fixture_project,
        &manifest_json,
    );
    let completion_decision = evaluate_real_allow(
        &completion_uncertain,
        &managed_profile,
        "completion-persistence-uncertain",
    );
    append_real_decision(&completion_uncertain, &completion_decision, "allow");
    let completion_prepared = completion_uncertain
        .database
        .begin_native_export(&completion_uncertain.request, &completion_uncertain.project)
        .unwrap();
    assert_eq!(
        write_atomic_bundle(&completion_prepared),
        NativeBundleWriteOutcome::PromotedAndSynced
    );
    assert_eq!(
        completion_uncertain
            .database
            .fail_native_completion_for_test(&completion_prepared.plan)
            .unwrap_err(),
        "coding_pack_export_completion_persistence_failed"
    );
    let completion_snapshot = completion_uncertain
        .database
        .get_operation_snapshot_data(&completion_uncertain.request.operation_id)
        .unwrap()
        .unwrap();
    assert_started_uncertainty(&completion_snapshot);
    assert!(completion_uncertain
        .destination
        .join(&completion_prepared.plan.target_name)
        .is_dir());
    assert!(completion_uncertain
        .database
        .begin_native_export(&completion_uncertain.request, &completion_uncertain.project)
        .is_err());

    let sync_uncertain = prepare_case(
        &cases_root,
        "post-promotion-sync-uncertain",
        &fixture_project,
        &manifest_json,
    );
    let sync_decision = evaluate_real_allow(
        &sync_uncertain,
        &managed_profile,
        "post-promotion-sync-uncertain",
    );
    append_real_decision(&sync_uncertain, &sync_decision, "allow");
    let sync_prepared = sync_uncertain
        .database
        .begin_native_export(&sync_uncertain.request, &sync_uncertain.project)
        .unwrap();
    assert_eq!(
        write_atomic_bundle_with_fault(&sync_prepared, ExportFault::DestinationSync),
        NativeBundleWriteOutcome::PromotedButDurabilityUncertain {
            reason_code: "post_promotion_durability_uncertain",
        }
    );
    let sync_snapshot = sync_uncertain
        .database
        .get_operation_snapshot_data(&sync_uncertain.request.operation_id)
        .unwrap()
        .unwrap();
    assert_started_uncertainty(&sync_snapshot);
    assert!(sync_uncertain
        .destination
        .join(&sync_prepared.plan.target_name)
        .is_dir());
    assert!(sync_uncertain
        .database
        .begin_native_export(&sync_uncertain.request, &sync_uncertain.project)
        .is_err());

    let event_payload_digests = completed
        .events
        .iter()
        .map(|event| event.payload_digest.clone())
        .collect::<Vec<_>>();
    let evidence = json!({
        "schemaVersion": "kerniq.v0.7.4.4.native-export-proof.v1",
        "repositoryCommit": repository_commit,
        "platform": {
            "os": "macos",
            "osVersion": os_version,
            "architecture": std::env::consts::ARCH,
            "temporaryRoot": "<TEMP_ROOT>",
            "realFilesystem": true,
            "realSQLite": true,
            "realAgentFuse": true,
            "mocksInPositiveProof": false,
        },
        "agentFuse": {
            "sourceRepository": "MkaliezZ/dhms-engine",
            "sourceCommit": AGENTFUSE_SOURCE_COMMIT,
            "packageVersion": AGENTFUSE_PACKAGE_VERSION,
            "sourceArchiveSha256": format!("sha256:{source_archive_sha256}"),
            "bridgeProtocol": AGENTFUSE_BRIDGE_PROTOCOL,
            "policyId": CODING_PACK_EXPORT_POLICY_ID,
            "policyDigest": CODING_PACK_EXPORT_POLICY_DIGEST,
            "evidenceSchema": "agentfuse-evidence-schema-v0.1",
            "handshakePackageVersion": positive_decision.handshake["agentFusePackageVersion"],
            "handshakeSourceCommit": positive_decision.handshake["agentFuseSourceCommit"],
        },
        "positive": {
            "operationId": positive.request.operation_id,
            "requestDigest": positive_decision.request_digest,
            "requestFieldNames": positive_decision
                .request
                .as_object()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
            "decisionId": positive_decision.response["decisionId"],
            "decision": positive_decision.response["decision"],
            "reasonCode": positive_decision.response["reasonCode"],
            "eventTypes": event_types(&completed),
            "eventPayloadDigests": event_payload_digests,
            "manifestDigest": positive_prepared.plan.manifest_digest,
            "sourceFingerprint": positive_prepared.plan.source_fingerprint,
            "packId": positive_prepared.plan.pack_id,
            "targetName": positive_prepared.plan.target_name,
            "exportPlanDigest": positive_prepared.plan.export_plan_digest,
            "destinationObjectIdentityBound": true,
            "exportedRelativePaths": exported_file_digests.keys().collect::<Vec<_>>(),
            "exportedFileDigests": exported_file_digests,
            "completedAt": completed_at,
            "stagingResidue": false,
            "privateAuthorityInManifest": false,
            "requestPrivateFieldsPresent": false,
            "selection": selection_evidence,
        },
        "negativeProofs": {
            "existingTarget": {
                "result": "pass",
                "existingTargetUntouched": true,
                "exportStarted": false,
                "stagingResidue": false,
            },
            "sourceDrift": {
                "result": "pass",
                "errorCode": "coding_pack_source_changed_before_export",
                "exportStarted": false,
                "destinationWrites": 0,
            },
            "policyDeny": {
                "result": "pass",
                "realPolicyDecision": deny_proof.response["decision"],
                "realPolicyReasonCode": deny_proof.response["reasonCode"],
                "durableMappedDecision": "deny",
                "mappingBoundary": "real invalid-request block and strict-store deny persistence are separate controlled assertions",
                "exportActionInvoked": false,
                "destinationWrites": 0,
            },
            "destinationUnavailable": {
                "result": "pass",
                "errorCode": "coding_pack_destination_unavailable",
                "unsafeWrite": false,
                "redirectedWrite": false,
            },
            "destinationRebind": {
                "result": "pass",
                "replacementWrites": 0,
                "originalOpenedObjectReceivedTarget": true,
                "redirectedWrite": false,
            },
        },
        "uncertaintyProofs": {
            "completionPersistenceFailure": {
                "faultInjection": true,
                "errorCode": "coding_pack_export_completion_persistence_failed",
                "targetRetained": true,
                "operationState": "export_started",
                "completedEvent": false,
                "interruptedEvent": false,
                "automaticRetry": false,
            },
            "postPromotionSyncFailure": {
                "faultInjection": true,
                "errorCode": "coding_pack_export_post_promotion_durability_uncertain",
                "targetRetained": true,
                "operationState": "export_started",
                "completedEvent": false,
                "interruptedEvent": false,
                "automaticRetry": false,
            },
        },
        "platformBoundary": {
            "macOSPhysicalExport": true,
            "windowsPhysicalExport": false,
            "browserPhysicalExport": false,
            "handleRelativeDestinationAuthority": true,
            "allFilesystemRaceFreeClaim": false,
            "identicalCrossPlatformPowerLossClaim": false,
        },
        "privacy": {
            "absolutePathsInArtifact": false,
            "authenticationMaterialPresent": false,
            "privateBindingMaterial": false,
        },
    });
    let encoded = serde_json::to_string_pretty(&evidence).unwrap() + "\n";
    assert!(!encoded.contains(&proof_root.to_string_lossy().to_string()));
    if let Some(home) = std::env::var_os("HOME") {
        assert!(!encoded.contains(&PathBuf::from(home).to_string_lossy().to_string()));
    }
    assert!(!encoded.contains("privateRootPath"));
    assert!(!encoded.contains("apiKey"));
    assert!(!encoded.contains("password"));
    assert!(!encoded.contains("Bearer "));
    fs::create_dir_all(evidence_output.parent().unwrap()).unwrap();
    fs::write(&evidence_output, encoded).unwrap();
}

fn prepare_case(
    cases_root: &Path,
    name: &str,
    fixture_project: &Path,
    manifest_json: &str,
) -> ProofCase {
    let root = cases_root.join(name);
    let project = root.join("project");
    let destination = root.join("destination");
    copy_fixture_project(fixture_project, &project);
    fs::create_dir_all(&destination).unwrap();
    let database = CodingPackDatabase::open_path(&root.join("store.sqlite3")).unwrap();
    let created_at = database_time(&database, "+0 seconds");
    let expires_at = database_time(&database, "+10 minutes");
    let approval_expires_at = database_time(&database, "+5 minutes");
    let binding = database
        .bind_destination(&destination, created_at.clone())
        .unwrap();
    let manifest = validate_manifest(manifest_json).unwrap();
    let mut proposal = CodingPackExportProposal {
        schema_version: EXPORT_PROPOSAL_SCHEMA.into(),
        operation_id: format!("proof-operation-{name}"),
        project_binding_id: format!("proof-project-{name}"),
        project_generation: 1,
        candidate_paths_digest: manifest.candidate_paths_digest,
        source_fingerprint: manifest.source_fingerprint,
        pack_id: manifest.pack_id,
        manifest_digest: manifest.manifest_digest,
        destination_binding_id: binding.destination_binding_id.clone(),
        destination_fingerprint: binding.destination_fingerprint.clone(),
        export_format: EXPORT_FORMAT.into(),
        created_at: created_at.clone(),
        expires_at,
        proposal_digest: String::new(),
    };
    proposal.proposal_digest = proposal_digest(&proposal).unwrap();
    let proposed_payload = serde_json::to_value(ProposedPayload {
        proposal: proposal.clone(),
    })
    .unwrap();
    let operation = CodingPackOperation {
        operation_id: proposal.operation_id.clone(),
        state: "proposed".into(),
        project_binding_id: proposal.project_binding_id.clone(),
        project_generation: proposal.project_generation,
        candidate_paths_digest: proposal.candidate_paths_digest.clone(),
        source_fingerprint: proposal.source_fingerprint.clone(),
        pack_id: proposal.pack_id.clone(),
        manifest_digest: proposal.manifest_digest.clone(),
        destination_binding_id: proposal.destination_binding_id.clone(),
        proposal_digest: proposal.proposal_digest.clone(),
        created_at: proposal.created_at.clone(),
        expires_at: proposal.expires_at.clone(),
        last_event_sequence: 1,
    };
    let proposed = CreateCodingPackOperationRequest {
        operation: operation.clone(),
        proposed_event: CodingPackEvent {
            event_id: format!("proof-event-{name}-proposed"),
            operation_id: proposal.operation_id.clone(),
            event_sequence: 1,
            event_type: "PACK_PROPOSED".into(),
            event_version: 1,
            recorded_at: created_at,
            payload_digest: sha256_canonical(&proposed_payload).unwrap(),
            payload: proposed_payload,
        },
    };
    database.create_operation(proposed).unwrap();

    let approved_at = database_time(&database, "+0 seconds");
    let approval = CodingPackExportApproval {
        schema_version: EXPORT_APPROVAL_SCHEMA.into(),
        operation_id: operation.operation_id.clone(),
        proposal_digest: operation.proposal_digest.clone(),
        approved_at: approved_at.clone(),
        expires_at: approval_expires_at,
    };
    let confirmed_payload = serde_json::to_value(ConfirmedPayload {
        approval: approval.clone(),
    })
    .unwrap();
    database
        .append_confirmation(ConfirmCodingPackOperationRequest {
            operation: CodingPackOperation {
                state: "confirmed".into(),
                last_event_sequence: 2,
                ..operation.clone()
            },
            confirmed_event: CodingPackEvent {
                event_id: format!("proof-event-{name}-confirmed"),
                operation_id: operation.operation_id.clone(),
                event_sequence: 2,
                event_type: "PACK_CONFIRMED".into(),
                event_version: 1,
                recorded_at: approved_at,
                payload_digest: sha256_canonical(&confirmed_payload).unwrap(),
                payload: confirmed_payload,
            },
        })
        .unwrap();

    ProofCase {
        database,
        project,
        destination,
        request: NativeExportRequest {
            operation_id: operation.operation_id,
            export_attempt_id: format!("proof-export-attempt-{name}"),
            canonical_manifest_json: manifest_json.into(),
            project_binding_id: operation.project_binding_id,
        },
        manifest_json: manifest_json.into(),
    }
}

fn evaluate_real_allow(case: &ProofCase, profile: &Path, label: &str) -> RealDecision {
    let snapshot = case
        .database
        .get_operation_snapshot_data(&case.request.operation_id)
        .unwrap()
        .unwrap();
    let (request, request_digest) = agentfuse_request(&snapshot);
    let (handshake, response) = run_real_bridge(profile, label, &request, &request_digest);
    assert_eq!(response["decision"], "allow");
    assert_eq!(response["operationId"], case.request.operation_id);
    assert_eq!(response["requestDigest"], request_digest);
    let serialized = serde_json::to_string(&request).unwrap();
    assert!(!serialized.contains(&case.project.to_string_lossy().to_string()));
    assert!(!serialized.contains(&case.destination.to_string_lossy().to_string()));
    assert!(!serialized.contains(&case.manifest_json));
    assert!(!serialized.contains("export const"));
    RealDecision {
        request,
        request_digest,
        response,
        handshake,
    }
}

fn evaluate_real_invalid_block(case: &ProofCase, profile: &Path, label: &str) -> RealDecision {
    let snapshot = case
        .database
        .get_operation_snapshot_data(&case.request.operation_id)
        .unwrap()
        .unwrap();
    let (mut request, _) = agentfuse_request(&snapshot);
    request["exportFormat"] = Value::String("invalid-proof-format".into());
    let request_digest = sha256_canonical(&json!({
        "toolIdentity": CODING_PACK_AGENTFUSE_EXPORT_TOOL,
        "request": request,
    }))
    .unwrap();
    let (handshake, response) = run_real_bridge(profile, label, &request, &request_digest);
    RealDecision {
        request,
        request_digest,
        response,
        handshake,
    }
}

fn agentfuse_request(snapshot: &CodingPackStoredSnapshotData) -> (Value, String) {
    let proposed: ProposedPayload =
        serde_json::from_value(snapshot.events[0].payload.clone()).unwrap();
    let approval_evidence_digest = snapshot.events[1].payload_digest.clone();
    let request = json!({
        "protocolVersion": CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL,
        "operationId": proposed.proposal.operation_id,
        "proposalDigest": proposed.proposal.proposal_digest,
        "approvalEvidenceDigest": approval_evidence_digest,
        "candidatePathsDigest": proposed.proposal.candidate_paths_digest,
        "sourceFingerprint": proposed.proposal.source_fingerprint,
        "packId": proposed.proposal.pack_id,
        "manifestDigest": proposed.proposal.manifest_digest,
        "destinationBindingId": proposed.proposal.destination_binding_id,
        "destinationFingerprint": proposed.proposal.destination_fingerprint,
        "exportFormat": EXPORT_FORMAT,
    });
    let digest = coding_pack_agentfuse_request_digest(
        &proposed.proposal,
        &snapshot.events[1].payload_digest,
    )
    .unwrap();
    (request, digest)
}

fn run_real_bridge(
    profile: &Path,
    label: &str,
    request: &Value,
    request_digest: &str,
) -> (Value, Value) {
    let executable = profile.join("distribution/python/bin/python3");
    let bridge_root = profile.join("bridge");
    let source_root = profile.join("agentfuse-source");
    let messages = [
        json!({
            "protocolVersion": AGENTFUSE_BRIDGE_PROTOCOL,
            "messageId": format!("proof-{label}-hello"),
            "messageType": "hello",
            "payload": {},
        }),
        json!({
            "protocolVersion": AGENTFUSE_BRIDGE_PROTOCOL,
            "messageId": format!("proof-{label}-decision"),
            "messageType": "coding_pack_export_decision_request",
            "payload": {
                "request": request,
                "requestDigest": request_digest,
                "policyProfileId": CODING_PACK_EXPORT_POLICY_ID,
                "expectedPolicyDigest": CODING_PACK_EXPORT_POLICY_DIGEST,
            },
        }),
        json!({
            "protocolVersion": AGENTFUSE_BRIDGE_PROTOCOL,
            "messageId": format!("proof-{label}-shutdown"),
            "messageType": "shutdown",
            "payload": {},
        }),
    ];
    let input = messages
        .iter()
        .map(serde_json::to_string)
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
        .join("\n")
        + "\n";
    let mut command = Command::new(executable);
    command
        .args([
            "-B",
            "-s",
            "-E",
            "-m",
            "kerniq_agentfuse_bridge",
            "--agentfuse-source",
        ])
        .arg(&source_root)
        .arg("--expected-commit")
        .arg(AGENTFUSE_SOURCE_COMMIT)
        .current_dir(&bridge_root)
        .env_clear()
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for key in ["PATH", "TMPDIR", "LANG", "LC_ALL"] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    let mut child = command.spawn().unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    let responses = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(responses.len(), 3);
    assert_eq!(responses[0]["messageType"], "hello_ack");
    assert_eq!(
        responses[0]["payload"]["agentFusePackageVersion"],
        AGENTFUSE_PACKAGE_VERSION
    );
    assert_eq!(
        responses[0]["payload"]["agentFuseSourceCommit"],
        AGENTFUSE_SOURCE_COMMIT
    );
    assert_eq!(
        responses[0]["payload"]["supportedDecisionSchema"],
        "agentfuse-evidence-schema-v0.1"
    );
    assert_eq!(
        responses[1]["messageType"],
        "coding_pack_export_decision_result"
    );
    assert_eq!(
        responses[1]["payload"]["policyDigest"],
        CODING_PACK_EXPORT_POLICY_DIGEST
    );
    assert_eq!(responses[2]["messageType"], "shutdown_ack");
    (
        responses[0]["payload"].clone(),
        responses[1]["payload"].clone(),
    )
}

fn append_real_decision(case: &ProofCase, decision: &RealDecision, expected: &str) {
    assert_eq!(decision.response["decision"], expected);
    let snapshot = case
        .database
        .get_operation_snapshot_data(&case.request.operation_id)
        .unwrap()
        .unwrap();
    append_decision_payload(
        case,
        &snapshot,
        decision.response["decisionId"].as_str().unwrap(),
        &decision.request_digest,
        if expected == "allow" { "allow" } else { "deny" },
        decision.response["reasonCode"].as_str().unwrap(),
        decision.response["decidedAt"].as_str().unwrap(),
    );
}

fn append_controlled_durable_deny(case: &ProofCase, real_block: &RealDecision) {
    let snapshot = case
        .database
        .get_operation_snapshot_data(&case.request.operation_id)
        .unwrap()
        .unwrap();
    let (_, valid_request_digest) = agentfuse_request(&snapshot);
    append_decision_payload(
        case,
        &snapshot,
        real_block.response["decisionId"].as_str().unwrap(),
        &valid_request_digest,
        "deny",
        real_block.response["reasonCode"].as_str().unwrap(),
        real_block.response["decidedAt"].as_str().unwrap(),
    );
}

fn append_decision_payload(
    case: &ProofCase,
    snapshot: &CodingPackStoredSnapshotData,
    decision_id: &str,
    request_digest: &str,
    decision: &str,
    reason_code: &str,
    decided_at: &str,
) {
    let proposed: ProposedPayload =
        serde_json::from_value(snapshot.events[0].payload.clone()).unwrap();
    let approval: ConfirmedPayload =
        serde_json::from_value(snapshot.events[1].payload.clone()).unwrap();
    let payload = DecidedPayload {
        decision_id: decision_id.into(),
        request_digest: request_digest.into(),
        proposal_digest: proposed.proposal.proposal_digest,
        approval_evidence_digest: snapshot.events[1].payload_digest.clone(),
        agent_fuse_source_commit: AGENTFUSE_SOURCE_COMMIT.into(),
        agent_fuse_package_version: AGENTFUSE_PACKAGE_VERSION.into(),
        bridge_protocol: AGENTFUSE_BRIDGE_PROTOCOL.into(),
        policy_id: CODING_PACK_EXPORT_POLICY_ID.into(),
        policy_digest: CODING_PACK_EXPORT_POLICY_DIGEST.into(),
        decision: decision.into(),
        reason_code: reason_code.into(),
        evaluation_started_at: approval.approval.approved_at,
        decided_at: decided_at.into(),
    };
    let payload = serde_json::to_value(payload).unwrap();
    let state = if decision == "allow" {
        "decided_allow"
    } else {
        "decided_deny"
    };
    case.database
        .append_decision(DecideCodingPackOperationRequest {
            operation: CodingPackOperation {
                state: state.into(),
                last_event_sequence: 3,
                ..snapshot.operation.clone()
            },
            decided_event: CodingPackEvent {
                event_id: format!("proof-event-{}-decided", case.request.operation_id),
                operation_id: case.request.operation_id.clone(),
                event_sequence: 3,
                event_type: "PACK_DECIDED".into(),
                event_version: 1,
                recorded_at: decided_at.into(),
                payload_digest: sha256_canonical(&payload).unwrap(),
                payload,
            },
        })
        .unwrap();
}

fn verify_exported_bundle(
    target: &Path,
    project: &Path,
    manifest_json: &str,
) -> BTreeMap<String, String> {
    let manifest_bytes = fs::read(target.join("manifest.json")).unwrap();
    assert_eq!(manifest_bytes, manifest_json.as_bytes());
    let mut digests = BTreeMap::new();
    digests.insert("manifest.json".into(), bytes_digest(&manifest_bytes));
    for relative in ["README.md", "src/main.ts", "src/utils.ts"] {
        let exported = fs::read(target.join("sources").join(relative)).unwrap();
        assert_eq!(exported, fs::read(project.join(relative)).unwrap());
        digests.insert(format!("sources/{relative}"), bytes_digest(&exported));
    }
    assert!(!target.join("sources/.env").exists());
    assert!(!target.join("sources/notes.bin").exists());
    for forbidden in [
        "operationId",
        "exportAttemptId",
        "destinationBindingId",
        "destinationObjectIdentityDigest",
        "stagingName",
        "privateRootPath",
    ] {
        assert!(!manifest_json.contains(forbidden));
    }
    digests
}

fn assert_case_not_started(case: &ProofCase) {
    let snapshot = case
        .database
        .get_operation_snapshot_data(&case.request.operation_id)
        .unwrap()
        .unwrap();
    assert_eq!(snapshot.operation.state, "decided_allow");
    assert_eq!(snapshot.events.len(), 3);
    assert!(snapshot
        .events
        .iter()
        .all(|event| event.event_type != "PACK_EXPORT_STARTED"));
}

fn assert_started_uncertainty(snapshot: &CodingPackStoredSnapshotData) {
    assert_eq!(snapshot.operation.state, "export_started");
    assert_eq!(snapshot.events.len(), 4);
    assert_eq!(snapshot.events[3].event_type, "PACK_EXPORT_STARTED");
    assert!(snapshot.events.iter().all(|event| {
        event.event_type != "PACK_EXPORT_COMPLETED" && event.event_type != "PACK_EXPORT_INTERRUPTED"
    }));
}

fn event_types(snapshot: &CodingPackStoredSnapshotData) -> Vec<&str> {
    snapshot
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect()
}

fn copy_fixture_project(source: &Path, destination: &Path) {
    fs::create_dir_all(destination.join("src")).unwrap();
    for relative in [
        "README.md",
        "src/main.ts",
        "src/utils.ts",
        ".env",
        "notes.bin",
    ] {
        fs::copy(source.join(relative), destination.join(relative)).unwrap();
    }
}

fn database_time(database: &CodingPackDatabase, modifier: &str) -> String {
    database
        .lock()
        .unwrap()
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?1)",
            [modifier],
            |row| row.get(0),
        )
        .unwrap()
}

fn no_staging_entries(destination: &Path) -> bool {
    fs::read_dir(destination).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".kerniq-coding-pack-staging-")
    })
}

fn sqlite_header_is_real(path: &Path) -> bool {
    fs::read(path)
        .map(|bytes| bytes.starts_with(b"SQLite format 3\0"))
        .unwrap_or(false)
}

fn bytes_digest(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("sha256:{:x}", hasher.finalize())
}

fn required_path(name: &str) -> PathBuf {
    PathBuf::from(std::env::var_os(name).unwrap_or_else(|| panic!("{name} is required")))
}

fn required_text(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} is required"))
}
