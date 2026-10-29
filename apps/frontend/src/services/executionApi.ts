import { client } from "./api";
import type {
  ExecutionBundle,
  ExecutionEvent,
  ActionContract,
} from "../types/execution";
const auth = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});
export const executionApi = {
  history: async (token: string, offset = 0) =>
    (
      await client.get<{ items: ExecutionBundle[]; total: number }>(
        `/executions?offset=${offset}&limit=20`,
        auth(token),
      )
    ).data,
  get: async (id: string, token: string) =>
    (await client.get<ExecutionBundle>(`/executions/${id}`, auth(token))).data,
  prepare: async (token: string) =>
    (
      await client.post<ExecutionBundle>(
        "/executions/demo/prepare",
        {},
        auth(token),
      )
    ).data,
  create: async (
    token: string,
    plan_id: string,
    contracts: ActionContract[],
    grounding_mode: string,
  ) =>
    (
      await client.post<ExecutionBundle>(
        "/executions",
        { plan_id, contracts, grounding_mode },
        auth(token),
      )
    ).data,
  command: async (id: string, token: string, command: string, payload = {}) =>
    (
      await client.post<ExecutionBundle>(
        `/executions/${id}/${command}`,
        payload,
        auth(token),
      )
    ).data,
  events: async (id: string, token: string, after: number) =>
    (
      await client.get<ExecutionEvent[]>(
        `/executions/${id}/events?after=${after}`,
        auth(token),
      )
    ).data,
  screenshot: async (id: string, token: string) =>
    (
      await client.get<Blob>(`/observations/${id}/screenshot`, {
        ...auth(token),
        responseType: "blob",
      })
    ).data,
  observation: async (id: string, token: string) =>
    (
      await client.get<{ timestamp: string }>(
        `/observations/${id}`,
        auth(token),
      )
    ).data,
};
export function mergeEvents(
  previous: ExecutionEvent[],
  incoming: ExecutionEvent[],
) {
  return [
    ...new Map(
      [...previous, ...incoming].map((event) => [event.id, event]),
    ).values(),
  ].sort((a, b) => a.sequence - b.sequence);
}
