import { client } from "./api";
import type { RecoveryBundle } from "../types/recovery";
import type { RecordEvent } from "../types/verification";
const auth = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});
export const recoveryApi = {
  list: async (token: string, offset = 0) =>
    (
      await client.get<{ items: RecoveryBundle[]; total: number }>(
        "/recoveries",
        { ...auth(token), params: { offset, limit: 20 } },
      )
    ).data,
  get: async (id: string, token: string) =>
    (await client.get<RecoveryBundle>(`/recoveries/${id}`, auth(token))).data,
  events: async (id: string, token: string, after: number) =>
    (
      await client.get<RecordEvent[]>(`/recoveries/${id}/events`, {
        ...auth(token),
        params: { after },
      })
    ).data,
  control: async (id: string, command: "cancel" | "retry", token: string) =>
    (
      await client.post<RecoveryBundle>(
        `/recoveries/${id}/${command}`,
        {},
        auth(token),
      )
    ).data,
  approve: async (
    bundle: RecoveryBundle,
    token: string,
    scope: "plan" | "high_risk",
    action_ids: string[],
  ) =>
    (
      await client.post<RecoveryBundle>(
        `/recoveries/${bundle.session.id}/approve`,
        { manifest_digest: bundle.plan?.digest, scope, action_ids },
        auth(token),
      )
    ).data,
};
