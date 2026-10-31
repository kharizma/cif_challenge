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

export const MARITAL_STATUSES = ['BELUM_KAWIN', 'KAWIN', 'CERAI'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const CREDIT_TYPES = ['KTA', 'KPR', 'KKB', 'MODAL_KERJA'] as const;
export type CreditType = (typeof CREDIT_TYPES)[number];

export const TENORS = [6, 12, 24, 36, 48, 60] as const;
export type Tenor = (typeof TENORS)[number];

export type CustomerStatus = 'PASS' | 'NOT PASS' | 'REFER';
export type DocsStatus = 'COMPLETE' | 'EMPTY';

export interface Customer {
  id: string;
  fullName: string;
  nik: string;
  birthDate: string;
  phone: string;
  maritalStatus: MaritalStatus;
  creditType: CreditType;
  loanAmount: number;
  tenor: Tenor;
  status: CustomerStatus;
  docs: DocsStatus;
  createdAt: string;
}

export type CustomerFormValues = {
  fullName: string;
  nik: string;
  birthDate: string;
  phone: string;
  maritalStatus: MaritalStatus | '';
  creditType: CreditType | '';
  loanAmount: string;
  tenor: Tenor | '';
};

export type CustomerFormErrors = Partial<Record<keyof CustomerFormValues, string>>;

export const DOCUMENT_TYPES = ['KTP', 'NPWP', 'SLIP_GAJI', 'BUKU_NIKAH', 'LAINNYA'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type DocumentUploadStatus = 'waiting' | 'uploading' | 'success' | 'failed';

export interface DocumentRecord {
  id: string;
  customerId: string;
  type: DocumentType;
  fileName: string;
  mime: string;
  size: number;
  uploadedBytes: number;
  status: DocumentUploadStatus;
  error?: string;
  createdAt: string;
}
