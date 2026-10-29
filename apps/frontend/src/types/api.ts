export interface SystemStatus {
  backend: boolean; database: boolean; browser: boolean; ready: boolean; version: string;
}
export interface ModelStatus {
  provider: string; configured: boolean; available: boolean | null; model: string; detail: string;
}
export interface VisionAnalysis {
  model: string; summary: string; elements: string[]; ui_state: string; response_id: string | null;
}
export interface Observation {
  id: string; timestamp: string; source: string; source_url: string; page_title: string;
  width: number; height: number; screenshot_url: string; analysis_status: string;
  analysis: VisionAnalysis | null;
}
