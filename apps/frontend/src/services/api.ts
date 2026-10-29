import axios from "axios";
import type {
  ModelStatus,
  Observation,
  SystemStatus,
  VisionAnalysis,
} from "../types/api";

export const client = axios.create({ baseURL: "/api/v1", timeout: 70000 });
export const api = {
  system: async () => (await client.get<SystemStatus>("/system/status")).data,
  model: async () => (await client.get<ModelStatus>("/models/status")).data,
  observations: async () =>
    (await client.get<Observation[]>("/observations")).data,
  observation: async (id: string) =>
    (await client.get<Observation>(`/observations/${id}`)).data,
  capture: async () =>
    (await client.post<Observation>("/observations/capture", {})).data,
  analyze: async (id: string, instruction: string) =>
    (
      await client.post<VisionAnalysis>(`/observations/${id}/analyze`, {
        instruction,
      })
    ).data,
};
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message: unknown = error.response?.data?.error?.message;
    if (typeof message === "string") return message;
    if (!error.response)
      return "Cannot reach the backend. Check that INTI AI is running.";
    return `Request failed (${error.response.status}). Please try again.`;
  }
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}
