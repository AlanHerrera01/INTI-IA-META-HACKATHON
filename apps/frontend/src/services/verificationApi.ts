import { client } from "./api";
import type {
  VerificationBundle,
  VerificationReport,
  RecordEvent,
} from "../types/verification";
const auth = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});
export const verificationApi = {
  list: async (token: string, offset = 0, execution_id?: string) =>
    (
      await client.get<{ items: VerificationBundle[]; total: number }>(
        "/verifications",
        { ...auth(token), params: { offset, limit: 20, execution_id } },
      )
    ).data,
  get: async (id: string, token: string) =>
    (await client.get<VerificationBundle>(`/verifications/${id}`, auth(token)))
      .data,
  create: async (
    execution_id: string,
    token: string,
    idempotency_key = "terminal",
  ) =>
    (
      await client.post<VerificationBundle>(
        "/verifications",
        { execution_id, idempotency_key },
        auth(token),
      )
    ).data,
  cancel: async (id: string, token: string) =>
    (
      await client.post<VerificationBundle>(
        `/verifications/${id}/cancel`,
        {},
        auth(token),
      )
    ).data,
  report: async (id: string, token: string) =>
    (
      await client.get<VerificationReport>(
        `/verifications/${id}/report`,
        auth(token),
      )
    ).data,
  events: async (id: string, token: string, after: number) =>
    (
      await client.get<RecordEvent[]>(`/verifications/${id}/events`, {
        ...auth(token),
        params: { after },
      })
    ).data,
  artifact: async (id: string, evidence: string, token: string) =>
    (
      await client.get<Blob>(
        `/verifications/${id}/evidence/${evidence}/artifact`,
        { ...auth(token), responseType: "blob" },
      )
    ).data,
};
