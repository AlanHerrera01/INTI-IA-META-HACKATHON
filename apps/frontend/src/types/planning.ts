export type PlanStatus =
  | "draft"
  | "valid"
  | "requires_clarification"
  | "rejected"
  | "expired";
export type Provenance = "model_visual" | "dom_assisted" | "unresolved";
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinate_system: "pixels" | "normalized_1000";
}
export interface VisualElement {
  id: string;
  element_type: string;
  label: string;
  description: string;
  bounding_box: BoundingBox | null;
  visible: boolean;
  enabled: boolean | null;
  source: Provenance;
  confidence_optional: number | null;
}
export interface ModelUsage {
  model: string;
  response_id: string;
  input_tokens: number | null;
  output_tokens: number | null;
  retries: number;
}
export interface VisualScene {
  id: string;
  observation_id: string;
  viewport: { width: number; height: number };
  elements: VisualElement[];
  summary: string;
  uncertainties: string[];
  generated_at: string;
  captured_at: string | null;
  model_usage: ModelUsage | null;
}
export interface PlannedAction {
  id: string;
  action_type: string;
  target: {
    element_id: string | null;
    description: string;
    source: Provenance;
    requires_observation: boolean;
  };
  parameters: {
    text: string | null;
    option: string | null;
    url: string | null;
    direction: string | null;
    amount: number | null;
    seconds: number | null;
    evidence: string | null;
  };
  preconditions: string[];
  expected_postconditions: string[];
  explanation: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "PROHIBITED";
}
export interface ValidationFinding {
  code: string;
  message: string;
  severity: "error" | "clarification" | "warning";
  action_id: string | null;
}
export interface ActionPlan {
  id: string;
  task_id: string;
  observation_id: string;
  goal: string;
  actions: PlannedAction[];
  status: PlanStatus;
  validation_results: ValidationFinding[];
  created_at: string;
  model_metadata: ModelUsage[];
}
export interface TaskIntent {
  goal: string;
  target_application: string;
  constraints: string[];
  expected_outcome: string;
  ambiguities: string[];
  explicit_requirements: string[];
  assumptions: string[];
  unverified_inferences: string[];
  model_usage: ModelUsage | null;
}
export interface PlanningResult {
  plan: ActionPlan;
  scene: VisualScene;
  intent: TaskIntent;
  assumptions: string[];
  unresolved_ambiguities: string[];
  warnings: string[];
  model_usage: ModelUsage[];
  validation_summary: string;
  started_at: string;
  ended_at: string;
  correlation_id: string;
}
export interface PlanningEvent {
  id: string;
  task_id: string;
  correlation_id: string;
  plan_id: string | null;
  kind: string;
  timestamp: string;
  code: string | null;
  model_usage: ModelUsage | null;
}
export interface PlanPage {
  items: PlanningResult[];
  total: number;
  offset: number;
  limit: number;
}
