export interface SystemStatus {
  backend: boolean;
  database: boolean;
  browser: boolean;
  ready: boolean;
  version: string;
}
export interface ModelStatus {
  provider: string;
  configured: boolean;
  available: boolean | null;
  model: string;
  detail: string;
  measurements?: {
    attempts: number;
    successful_calls: number;
    failed_calls: number;
    mean_latency_ms: number | null;
    output_tokens_per_second: number | null;
    token_samples: number;
    grounding_samples: number;
    grounding_hit_rate: number | null;
    last_at: number | null;
    last_ok: boolean | null;
    last_http_status: number | null;
    gpu_memory_bytes: null;
    window_limit: number;
  };
}
export interface VisionAnalysis {
  model: string;
  summary: string;
  elements: string[];
  ui_state: string;
  response_id: string | null;
}
export interface Observation {
  id: string;
  timestamp: string;
  source: string;
  source_url: string;
  page_title: string;
  width: number;
  height: number;
  screenshot_url: string;
  analysis_status: string;
  analysis: VisionAnalysis | null;
}
