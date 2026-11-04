import { createContext, useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { computerApi } from "../services/computerApi";
import { useOperator } from "./useOperator";
import { useModel, useSystem } from "./useSystem";
import { localMetrics } from "../features/computer/workflow";

export function useNativeData() {
  const { token } = useOperator();
  const [search] = useSearchParams();
  const params = useParams();
  const [selectedId, setSelectedId] = useState(
    search.get("task") || params.id || "",
  );
  const [deviceId, setDeviceId] = useState("");
  const [polling, setPolling] = useState(true);
  const query = useQuery({
    queryKey: ["computer-state", token],
    queryFn: () => computerApi.state(token),
    enabled: !!token,
    refetchInterval: polling ? 1500 : false,
    retry: false,
  });
  const data = token && !query.isError ? query.data : undefined;
  const tasks = data?.tasks || [];
  const devices = data?.devices.filter((device) => !device.revoked) || [];
  const selected = selectedId
    ? tasks.find((task) => task.id === selectedId)
    : tasks[0];
  const device =
    devices.find((device) => device.id === deviceId) ||
    devices.find((device) => device.id === selected?.device_id) ||
    devices[0];
  const applications = useQuery({
    queryKey: ["computer-applications", token, device?.id],
    queryFn: () => computerApi.applications(token, device!.id),
    enabled: !!data && !!device,
    refetchInterval: polling ? 5000 : false,
    retry: false,
  });
  const catalog = data && !applications.isError ? applications.data : undefined;
  const model = useModel();
  const system = useSystem();
  return {
    token,
    query,
    data,
    tasks,
    devices,
    device,
    selected,
    setSelectedId,
    setDeviceId,
    catalog,
    applications,
    model,
    system,
    metrics: localMetrics(tasks),
    polling,
    setPolling,
  };
}
export const NativeWorkspaceContext = createContext<ReturnType<
  typeof useNativeData
> | null>(null);
export function useNativeWorkspace() {
  const context = useContext(NativeWorkspaceContext);
  if (!context) throw new Error("Native workspace provider required");
  return context;
}
