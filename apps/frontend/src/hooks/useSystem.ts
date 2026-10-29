import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useSystem() {
  return useQuery({ queryKey: ['system'], queryFn: api.system, refetchInterval: 30000 });
}
export function useModel() {
  return useQuery({ queryKey: ['model'], queryFn: api.model, refetchInterval: 30000 });
}
