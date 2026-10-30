import { client } from "./api";
import type {
  Mission,
  MissionDetail,
  MissionOverview,
  DemoState,
  BenchmarkArtifact,
} from "../types/mission";
const auth = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});
export const missionApi = {
  overview: async (token: string) =>
    (await client.get<MissionOverview>("/mission-control", auth(token))).data,
  get: async (id: string, token: string) =>
    (await client.get<MissionDetail>(`/missions/${id}`, auth(token))).data,
  list: async (token: string, offset = 0) =>
    (
      await client.get<{ items: Mission[]; total: number }>("/missions", {
        ...auth(token),
        params: { offset, limit: 20 },
      })
    ).data,
  create: async (objective: string, mode: Mission["mode"], token: string) =>
    (
      await client.post<Mission>(
        "/missions",
        { objective, mode, target_application: "inventory" },
        auth(token),
      )
    ).data,
  prepare: async (id: string, token: string) =>
    (
      await client.post<Mission>(
        `/missions/${id}/prepare`,
        {},
        { ...auth(token), timeout: 180000 },
      )
    ).data,
  prepareExecution: async (id: string, contracts: unknown, token: string) =>
    (
      await client.post<Mission>(
        `/missions/${id}/execution`,
        { contracts, grounding_mode: "hybrid_dom" },
        auth(token),
      )
    ).data,
  arm: async (id: string, token: string) =>
    (await client.post<Mission>(`/missions/${id}/demo-fault`, {}, auth(token)))
      .data,
  demo: async (token: string) =>
    (await client.get<DemoState>("/demo/status", auth(token))).data,
  reset: async (store_id: string, token: string) =>
    (
      await client.post<DemoState>(
        "/demo/reset",
        { store_id, confirmation: "RESET PC-104" },
        auth(token),
      )
    ).data,
};
export const benchmarkApi = {
  list: async () =>
    (
      await client.get<{
        items: BenchmarkArtifact[];
        unavailable: string[];
        comparative_evaluation_available: boolean;
      }>("/benchmarks")
    ).data,
};
