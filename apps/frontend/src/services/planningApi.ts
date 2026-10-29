import { client } from "./api";
import type {
  PlanPage,
  PlanningEvent,
  PlanningResult,
  VisualScene,
} from "../types/planning";

export const planningApi = {
  interpret: async (observation_id: string, goal?: string) =>
    (
      await client.post<VisualScene>(
        "/scenes/interpret",
        { observation_id, goal },
        { timeout: 250000 },
      )
    ).data,
  generate: async (
    observation_id: string,
    user_goal: string,
    constraints: string[],
  ) =>
    (
      await client.post<PlanningResult>(
        "/plans/generate",
        { observation_id, user_goal, constraints },
        { timeout: 250000 },
      )
    ).data,
  get: async (id: string) =>
    (await client.get<PlanningResult>(`/plans/${id}`)).data,
  list: async (offset = 0) =>
    (await client.get<PlanPage>("/plans", { params: { offset, limit: 10 } }))
      .data,
  validate: async (id: string) =>
    (await client.post<PlanningResult>(`/plans/${id}/validate`)).data,
  events: async (id: string) =>
    (await client.get<PlanningEvent[]>(`/plans/${id}/events`)).data,
};
