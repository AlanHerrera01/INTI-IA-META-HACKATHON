import type { ExecutionBundle, ExecutionEvent } from "./execution";
import type { PlanningResult } from "./planning";
import type { RecoveryBundle } from "./recovery";
import type {
  Verdict,
  VerificationBundle,
  VerificationReport,
} from "./verification";
export interface Mission {
  id: string;
  objective: string;
  mode: "meta" | "authored_demo";
  created_by: string;
  target_application: "inventory";
  status: string;
  observation_id: string | null;
  plan_id: string | null;
  execution_id: string | null;
  error_code: string | null;
  fault_armed: boolean;
  fault_injected: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}
export interface MissionDetail {
  mission: Mission;
  plan: PlanningResult | null;
  execution: ExecutionBundle | null;
  phase: string;
  events: ExecutionEvent[];
  recoveries: RecoveryBundle[];
  verifications: VerificationBundle[];
  verification_report: VerificationReport | null;
}
export interface MissionOverview {
  missions: Mission[];
  mission_count: number;
  active_executions: number;
  executions: ExecutionBundle[];
  recent_verifications: VerificationBundle[];
  latest_verdict: Verdict | null;
  recent_events: MissionActivity[];
  model_calls_enabled: boolean;
  demo_controls_enabled: boolean;
  features: MissionFeatures;
}
export interface MissionActivity
  extends Pick<ExecutionEvent, "id" | "event_type" | "timestamp"> {
  source: "execution" | "planning" | "recovery" | "verification";
}
export interface MissionFeatures {
  execution_enabled: boolean;
  verification_enabled: boolean;
  recovery_enabled: boolean;
  recovery_live_model_enabled: boolean;
  demo_controls_enabled: boolean;
}
export interface DemoState {
  store_id: string;
  synthetic: boolean;
  faults_active: boolean;
  asset: { id: string; status: string; version: number };
}
export interface BenchmarkArtifact {
  report_id: string;
  filename: string;
  sha256: string;
  evaluation_mode: string;
  limitations: string[];
  data: {
    mode: string;
    recorded_at?: string;
    scenarios?: number;
    evaluated?: number;
    model_calls?: number;
    verification_success_rate?: Ratio;
    verdict_accuracy?: Ratio;
    false_positive_detection_rate?: Ratio;
    false_negative_rate?: Ratio;
    inconclusive_rate?: Ratio;
    criteria_evaluation_accuracy?: Ratio;
    mean_verification_latency_ms?: number;
    evidence_collection_failures?: number;
    evidence_integrity_validation_failures?: number;
    observed_inventory_mutations_by_verifier?: number;
    results?: {
      scenario: string;
      execution_status: string;
      actual_verdict: string;
      latency_ms: number;
      source_available: boolean;
    }[];
    expected_outcome_match_rate?: number;
    mean_latency_ms?: number;
  };
}
export interface Ratio {
  numerator: number;
  denominator: number;
}
