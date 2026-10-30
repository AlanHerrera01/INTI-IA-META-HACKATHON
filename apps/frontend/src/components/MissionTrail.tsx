import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useOperator } from "../hooks/useOperator";
import { missionApi } from "../services/missionApi";
export function MissionTrail() {
  const location = useLocation();
  const id = new URLSearchParams(location.search).get("mission");
  const { token } = useOperator();
  const mission = useQuery({
    queryKey: ["mission", id, token],
    queryFn: () => missionApi.get(id!, token),
    enabled: !!id && !!token,
  });
  if (!id) return null;
  return (
    <div className="mission-trail">
      <Link to={`/missions/${id}`}>← Return to mission</Link>
      <span>{mission.data?.mission.objective || "Mission context"}</span>
      <code>{id.slice(0, 8)}</code>
    </div>
  );
}
