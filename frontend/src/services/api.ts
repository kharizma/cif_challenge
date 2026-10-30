import axios from 'axios';
import type { StatsResponse } from '../types';

export const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

export async function fetchStats(): Promise<StatsResponse> {
  const { data } = await api.get<StatsResponse>('/dashboard/stats');
  return data;
}
