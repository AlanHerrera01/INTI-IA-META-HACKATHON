import { client } from "./api";
export interface ComputerDevice {
  id: string;
  name: string;
  platform: string;
  root: string;
  last_seen: number;
  revoked: number;
}
export interface ComputerStep {
  id: string;
  status: string;
  path?: string;
  sha256?: string;
  bytes?: number;
  pid?: number;
  url?: string;
  application_id?: string;
  identity?: string;
}
export interface ComputerApplication {
  id: string;
  name: string;
  path: string;
  identity: string;
  allowed: boolean;
}
export interface DocumentRequest {
  reference: string;
  customer: string;
  contact: string;
  email: string;
  city: string;
  issued: string;
  valid_until: string;
  tax_basis_points: number;
  notes: string;
  items: { description: string; quantity: number; unit_cents: number }[];
}
export interface ComputerTask {
  id: string;
  device_id: string;
  status: string;
  digest: string;
  created_at: number;
  updated_at: number;
  plan: {
    id: string;
    device_id: string;
    authorized_root: string;
    source: string;
  } & (
    | {
        kind: "open_application";
        application: Omit<ComputerApplication, "allowed">;
        filename?: never;
        content?: never;
        url?: never;
      }
    | {
        kind?: "create_documents";
        document_request?: DocumentRequest;
        application?: never;
        filename: string;
        content: string;
        url: string;
      }
  );
  steps: { id: string; action: string; target: string }[];
  result: { ok: boolean; steps: ComputerStep[]; error?: string | null } | null;
}
export interface ComputerState {
  devices: ComputerDevice[];
  tasks: ComputerTask[];
  model_calls: number;
  planning_mode: string;
}
const auth = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});
export const computerApi = {
  prepareDocuments: async (
    token: string,
    deviceId: string,
    documentRequest: DocumentRequest,
  ) =>
    (
      await client.post<ComputerTask>(
        "/computer/document-tasks",
        { device_id: deviceId, document_request: documentRequest },
        auth(token),
      )
    ).data,
  applications: async (token: string, deviceId: string) =>
    (
      await client.get<{
        applications: ComputerApplication[];
        scanned_at: number | null;
      }>(`/computer/applications/${deviceId}`, auth(token))
    ).data,
  permitApplication: async (
    token: string,
    deviceId: string,
    app: ComputerApplication,
    allowed: boolean,
  ) =>
    (
      await client.post(
        `/computer/applications/${deviceId}/${app.id}/permission`,
        { identity: app.identity, allowed },
        auth(token),
      )
    ).data,
  prepareApplication: async (
    token: string,
    deviceId: string,
    app: ComputerApplication,
  ) =>
    (
      await client.post<ComputerTask>(
        "/computer/application-tasks",
        { device_id: deviceId, application_id: app.id, identity: app.identity },
        auth(token),
      )
    ).data,
  state: async (token: string) =>
    (await client.get<ComputerState>("/computer/state", auth(token))).data,
  pairing: async (token: string) =>
    (
      await client.post<{ code: string; expires_at: number }>(
        "/computer/pairing",
        {},
        auth(token),
      )
    ).data,
  prepare: async (
    token: string,
    payload: {
      device_id: string;
      filename: string;
      content: string;
      url: string;
    },
  ) =>
    (await client.post<ComputerTask>("/computer/tasks", payload, auth(token)))
      .data,
  approve: async (token: string, id: string, digest: string) =>
    (
      await client.post<ComputerTask>(
        `/computer/tasks/${id}/approve`,
        { digest },
        auth(token),
      )
    ).data,
  cancel: async (token: string, id: string) =>
    (
      await client.post<ComputerTask>(
        `/computer/tasks/${id}/cancel`,
        {},
        auth(token),
      )
    ).data,
  revoke: async (token: string, id: string) =>
    (await client.post(`/computer/devices/${id}/revoke`, {}, auth(token))).data,
};
