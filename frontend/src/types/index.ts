import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export interface Stat {
  id: string;
  label: string;
  value: number;
  delta: number;
}

export interface RecentItem {
  id: string;
  reference: string;
  owner: string;
  status: 'active' | 'pending' | 'closed';
  updatedAt: string;
}

export interface StatsResponse {
  stats: Stat[];
  recent: RecentItem[];
}
