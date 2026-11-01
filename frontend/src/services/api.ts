import axios from 'axios';
import type {
  CifCheckResult,
  CifDocument,
  Customer,
  CustomerFormValues,
  Pagination,
  StatsResponse,
} from '../types';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

interface RawDocument {
  id: string;
  application_id?: string;
  file_name: string;
  doc_type: CifDocument['doc_type'];
  file_type: string;
  size: number;
  created_at: string;
}

interface RawCustomer {
  id: string;
  application_id?: string;
  full_name: string;
  dob: string;
  phone?: string;
  marital_status: Customer['maritalStatus'];
  loan_type: Customer['creditType'];
  loan_amount: number;
  loan_tenor_months: Customer['tenor'];
  status: Customer['status'];
  decision?: string;
  reason?: string;
  identity_confidence?: number;
  credit_score?: number;
  matched_no_cif?: string;
  created_at: string;
  documents?: RawDocument[] | null;
}

interface RawCheckData {
  application_id: string;
  status: Customer['status'];
  decision?: string;
  reason?: string;
  identity_confidence?: number;
  credit_score?: number;
  matched_no_cif?: string;
  customer: RawCustomer;
  scoring?: CifCheckResult['scoring'];
}

function toCustomer(raw: RawCustomer): Customer {
  const documents = raw.documents ?? [];
  return {
    id: raw.id,
    applicationId: raw.application_id,
    fullName: raw.full_name,
    // NIK is used for matching only and is not stored by the backend.
    nik: '',
    birthDate: raw.dob.slice(0, 10),
    phone: raw.phone ?? '',
    maritalStatus: raw.marital_status,
    creditType: raw.loan_type,
    loanAmount: raw.loan_amount,
    tenor: raw.loan_tenor_months,
    status: raw.status,
    docs: documents.length > 0 ? 'COMPLETE' : 'EMPTY',
    createdAt: raw.created_at,
    decision: raw.decision,
    reason: raw.reason,
    identityConfidence: raw.identity_confidence,
    creditScore: raw.credit_score,
    matchedNoCif: raw.matched_no_cif,
    documents,
  };
}

export async function fetchStats(): Promise<StatsResponse> {
  const { data } = await api.get<StatsResponse>('/dashboard/stats');
  return data;
}

export async function fetchCifList(
  page: number,
  limit: number,
): Promise<{ customers: Customer[]; pagination: Pagination }> {
  const { data } = await api.get<{
    data: { items: RawCustomer[]; pagination: Pagination };
  }>('/cif', { params: { page, limit } });
  return {
    customers: data.data.items.map(toCustomer),
    pagination: data.data.pagination,
  };
}

export async function checkCif(values: CustomerFormValues): Promise<CifCheckResult> {
  const { data } = await api.post<{ data: RawCheckData }>('/cif/check', {
    full_name: values.fullName.trim(),
    nik: values.nik.trim(),
    dob: values.birthDate,
    phone: values.phone,
    marital_status: values.maritalStatus,
    loan_type: values.creditType,
    loan_amount: Number(values.loanAmount),
    loan_tenor_months: Number(values.tenor),
  });
  const result = data.data;
  return {
    customer: toCustomer(result.customer),
    status: result.status,
    decision: result.decision,
    reason: result.reason,
    identityConfidence: result.identity_confidence,
    creditScore: result.credit_score,
    matchedNoCif: result.matched_no_cif,
    scoring: result.scoring,
  };
}

export async function uploadCifDocument(
  applicationId: string,
  docType: string,
  file: Blob,
  fileName: string,
): Promise<RawDocument> {
  const form = new FormData();
  form.append('doc_type', docType);
  form.append('file', file, fileName);
  const { data } = await api.post<{ data: RawDocument }>('/uploads', form, {
    headers: { 'X-Application-Id': applicationId },
  });
  return data.data;
}

export async function fetchUploadBlob(applicationId: string, uploadId: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/uploads/${uploadId}`, {
    headers: { 'X-Application-Id': applicationId },
    responseType: 'blob',
  });
  return data;
}

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    if (message) return message;
    if (error.code === 'ECONNABORTED') return 'Permintaan melebihi batas waktu.';
    if (!error.response) return 'Backend tidak dapat dihubungi.';
  }
  return 'Terjadi kesalahan. Coba lagi.';
}
