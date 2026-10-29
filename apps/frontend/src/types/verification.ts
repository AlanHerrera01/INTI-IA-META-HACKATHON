export type Verdict = "VERIFIED_SUCCESS" | "VERIFIED_FAILURE" | "INCONCLUSIVE";
export type VerificationStatus =
  | "CREATED"
  | "COLLECTING_EVIDENCE"
  | "EVALUATING"
  | "COMPLETED"
  | "INCONCLUSIVE"
  | "FAILED"
  | "CANCELLED";
export type Value =
  | string
  | number
  | boolean
  | null
  | Record<string, string | number | boolean | null>;
export interface SuccessCriterion {
  id: string;
  task_id: string;
  description: string;
  assertion_type: string;
  expected_value: Value;
  target_reference: { record_id: string; field: string; application: string };
  evidence_requirements: { evidence_type: string; min_count: number }[];
  required: boolean;
}
export interface CriterionResult {
  criterion_id: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  observed_value: Value;
  expected_value: Value;
  evidence_ids: string[];
  explanation: string;
}
export interface CriteriaVersion {
  id: string;
  task_id: string;
  execution_id: string;
  objective: string;
  version: number;
  criteria: SuccessCriterion[];
  approved_by: string;
  approval_reason: string;
  created_at: string;
  digest: string;
  original_manifest_digest: string;
  baseline: {
    artifact_id: string;
    content_hash: string;
    captured_at: string;
    source_store_id: string;
    collection_id: string;
  } | null;
}
export interface Evidence {
  id: string;
  verification_session_id: string;
  evidence_type: string;
  source: string;
  captured_at: string;
  artifact_reference: string;
  content_hash: string;
  metadata: {
    source_system: string;
    collection_method: string;
    target_record_id: string;
    task_id: string;
    execution_id: string;
    verification_id: string;
    role: string;
    source_url: string;
    nonce: string;
    source_store_id: string | null;
    content_type: "image/png" | "application/json";
    byte_count: number;
  };
}
export interface VerificationSession {
  id: string;
  task_id: string;
  execution_id: string;
  criteria_version_id: string;
  idempotency_key: string;
  status: VerificationStatus;
  started_at: string;
  completed_at: string | null;
  final_verdict: Verdict | null;
  evidence_ids: string[];
  criteria_results: CriterionResult[];
  error_code: string | null;
  limitations: string[];
  correlation_id: string;
  version: number;
}
export interface VerificationBundle {
  session: VerificationSession;
  criteria_version: CriteriaVersion;
  evidence: Evidence[];
}
export interface VerificationReport {
  project: "INTI AI";
  task_id: string;
  execution_id: string;
  verification_id: string;
  original_objective: string;
  criteria_version: CriteriaVersion;
  verification: VerificationSession;
  execution_summary: {
    status: string;
    declared_overall_goal_verified: boolean;
    action_count: number;
    actions_executed: number;
    immediate_postconditions_passed: number;
  };
  evidence: Evidence[];
  criteria_results: CriterionResult[];
  final_verdict: Verdict | null;
  effective_verdict: Verdict | null;
  integrity_checks: {
    evidence_id: string;
    intact: boolean;
    error: string | null;
  }[];
  limitations: string[];
}
export interface RecordEvent {
  id: string;
  event_type: string;
  timestamp: string;
  sequence: number;
  payload: Record<string, unknown>;
}
export const verificationTerminal = new Set<VerificationStatus>([
  "COMPLETED",
  "INCONCLUSIVE",
  "FAILED",
  "CANCELLED",
]);
