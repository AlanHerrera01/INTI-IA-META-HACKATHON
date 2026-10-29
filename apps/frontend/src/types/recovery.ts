import type {
  ExecutableAction,
  ActionResult,
  BrowserTarget,
} from "./execution";
import type { BoundingBox } from "./planning";
export interface RecoveryBundle {
  session: {
    id: string;
    execution_id: string;
    failed_action_id: string;
    initial_failure_type: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    final_outcome: string | null;
    attempts_count: number;
    model_calls: number;
    actions_used: number;
    tokens_used: number | null;
    retry_allowed: boolean;
    evidence_ids: string[];
    budget: {
      max_attempts: number;
      max_model_calls: number;
      max_actions: number;
      max_duration_seconds: number;
      max_tokens_optional: number | null;
    };
  };
  context: {
    observed_state: string;
    error_details: string;
    previous_observation_id: string;
    current_observation_id: string;
  };
  diagnoses: {
    id: string;
    failure_type: string;
    observed_facts: string[];
    hypotheses: string[];
    change_summary: string;
    uncertainties: string[];
    candidate_targets: BrowserTarget[];
    changed_regions: BoundingBox[];
  }[];
  plan: {
    objective: string;
    digest: string;
    actions: ExecutableAction[];
    decision: {
      justification: string;
      requires_approval: boolean;
      assumptions: string[];
    };
  } | null;
  plan_approved: boolean;
  decisions: { action_id: string; approved_by: string; approved_at: string }[];
  attempts: {
    id: string;
    attempt_number: number;
    started_at: string;
    completed_at: string | null;
    outcome: string;
  }[];
  results: ActionResult[];
  warnings: string[];
}
