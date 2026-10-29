import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ObservationViewer } from '../features/observations/ObservationViewer';
import { api, errorMessage } from '../services/api';

export function ObservationPage() {
  const { id = '' } = useParams();
  const observation = useQuery({ queryKey: ['observations', id], queryFn: () => api.observation(id) });
  return <><Link className="back-link" to="/observations">← All observations</Link><h1>Observation details</h1><section className="panel">
    {observation.isPending ? <p role="status" className="padded">Loading observation…</p> : observation.isError ? <p className="error" role="alert">{errorMessage(observation.error)}</p> : <ObservationViewer key={id} observation={observation.data} />}
  </section></>;
}
