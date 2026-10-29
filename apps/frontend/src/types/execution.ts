import type { BoundingBox, PlannedAction, PlanningResult } from "./planning";
export type ExecutionStatus =
  | "CREATED"
  | "AWAITING_APPROVAL"
  | "READY"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";
export interface BrowserTarget {
  role: string;
  name: string;
  selector: string | null;
}
export interface BrowserCheck {
  kind: string;
  target: BrowserTarget | null;
  expected: string | null;
}
export interface ActionContract {
  planned_action_id: string;
  target: BrowserTarget | null;
  preconditions: BrowserCheck[];
  postconditions: BrowserCheck[];
}
export interface ExecutableAction {
  id: string;
  planned_action_id: string;
  action_type: string;
  target: BrowserTarget | null;
  parameters: PlannedAction["parameters"];
  preconditions: BrowserCheck[];
  expected_postconditions: BrowserCheck[];
  risk_level: PlannedAction["risk_level"];
  authorization_status: string;
}
export interface ActionResult {
  action_id: string;
  execution_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  before_observation_id: string | null;
  after_observation_id: string | null;
  action_executed: boolean;
  postconditions_satisfied: boolean | null;
  may_have_executed: boolean;
  resolution: { method: string; bounding_box: BoundingBox | null } | null;
}
export interface ExecutionBundle {
  session: {
    id: string;
    plan_id: string;
    task_id: string;
    status: ExecutionStatus;
    current_action_index: number;
    started_at: string | null;
    updated_at: string;
    completed_at: string | null;
    error_summary: string | null;
    error_code: string | null;
    latest_observation_id: string | null;
    overall_goal_verified: boolean;
    pause_requested: boolean;
  };
  manifest: {
    digest: string;
    plan_snapshot: PlanningResult;
    plan_digest: string;
    initial_url: string;
    viewport: { width: number; height: number };
    grounding_mode: "visual_only" | "hybrid_dom" | "selector_based";
    actions: ExecutableAction[];
    limits: {
      max_actions: number;
      max_duration_seconds: number;
      action_timeout_seconds: number;
      max_navigation_count: number;
    };
  };
  decisions: {
    action_id: string;
    decision: string;
    approved_by: string;
    approved_at: string;
    reason: string;
  }[];
  results: ActionResult[];
  plan_approved: boolean;
  browser_session: {
    id: string;
    status: string;
    current_url: string;
    viewport: { width: number; height: number };
    last_activity_at: string;
  } | null;
}
export interface ExecutionEvent {
  id: string;
  execution_id: string;
  event_type: string;
  timestamp: string;
  sequence: number;
  payload: Record<string, unknown>;
}
export const terminal = new Set<ExecutionStatus>([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);
