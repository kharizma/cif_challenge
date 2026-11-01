import type { Customer, CustomerFormErrors, CustomerFormValues, DocumentRecord } from '../types';

export {
  MARITAL_STATUSES as maritalStatusOptions,
  CREDIT_TYPES as creditTypeOptions,
  TENORS as tenorOptions,
} from '../types';

export const LOAN_MIN = 5_000_000;
export const LOAN_MAX = 500_000_000;

export const EMPTY_FORM: CustomerFormValues = {
  fullName: '',
  nik: '',
  birthDate: '',
  phone: '',
  maritalStatus: '',
  creditType: '',
  loanAmount: '',
  tenor: '',
};

const NAME_PATTERN = /^[A-Za-z .,'-]+$/;
const NIK_PATTERN = /^\d{16}$/;
const PHONE_PATTERN = /^(?:\+628|628|08)\d{8,11}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateCustomer(values: CustomerFormValues): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  const name = values.fullName.trim();

  if (name.length === 0) {
    errors.fullName = 'Nama wajib diisi.';
  } else if (name.length < 3 || name.length > 100) {
    errors.fullName = 'Nama harus 3-100 karakter.';
  } else if (!NAME_PATTERN.test(name)) {
    errors.fullName = 'Hanya huruf, spasi, titik, koma, apostrof, dan tanda hubung.';
  }

  if (values.nik.trim().length === 0) {
    errors.nik = 'NIK wajib diisi.';
  } else if (!NIK_PATTERN.test(values.nik.trim())) {
    errors.nik = 'NIK harus tepat 16 digit angka.';
  }

  if (values.birthDate.length === 0) {
    errors.birthDate = 'Tanggal lahir wajib diisi.';
  } else if (!DATE_PATTERN.test(values.birthDate)) {
    errors.birthDate = 'Format tanggal harus YYYY-MM-DD.';
  } else {
    const date = new Date(`${values.birthDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(date.getTime())) {
      errors.birthDate = 'Tanggal lahir tidak valid.';
    } else if (date > today) {
      errors.birthDate = 'Tanggal lahir tidak boleh di masa depan.';
    }
  }

  if (values.phone.length > 0 && !PHONE_PATTERN.test(values.phone)) {
    errors.phone = 'Nomor harus diawali 08, 628, atau +628, lalu 8-11 digit.';
  }

  if (values.maritalStatus === '') errors.maritalStatus = 'Pilih status perkawinan.';
  if (values.creditType === '') errors.creditType = 'Pilih jenis kredit.';

  if (values.loanAmount.trim().length === 0) {
    errors.loanAmount = 'Jumlah pinjaman wajib diisi.';
  } else {
    const amount = Number(values.loanAmount);
    if (!Number.isInteger(amount) || amount < LOAN_MIN) {
      errors.loanAmount = 'Minimal Rp5.000.000 tanpa desimal.';
    } else if (amount > LOAN_MAX) {
      errors.loanAmount = 'Maksimal Rp500.000.000.';
    }
  }

  if (values.tenor === '') errors.tenor = 'Pilih tenor pinjaman.';

  return errors;
}

export function hasErrors(errors: CustomerFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function maskNik(nik: string): string {
  if (nik.length <= 5) return nik;
  return `${nik.slice(0, 3)}${'X'.repeat(nik.length - 5)}${nik.slice(-2)}`;
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export const STATUS_STYLES: Record<string, string> = {
  PASS: 'bg-emerald-50 text-emerald-700',
  'NOT PASS': 'bg-red-50 text-red-700',
  REFER: 'bg-amber-50 text-amber-700',
};

export const DOCS_STYLES: Record<string, string> = {
  COMPLETE: 'bg-emerald-50 text-emerald-700',
  EMPTY: 'bg-neutral-100 text-neutral-600',
};

const DOC_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};

// Maps backend documents to the upload UI record shape.
export function documentRecords(customer: Customer): DocumentRecord[] {
  return (customer.documents ?? []).map((doc) => ({
    id: doc.id,
    serverId: doc.id,
    customerId: customer.id,
    type: doc.doc_type,
    fileName: doc.file_name,
    mime: DOC_MIME[doc.file_type] ?? 'application/octet-stream',
    size: doc.size,
    uploadedBytes: doc.size,
    status: 'success',
    createdAt: doc.created_at,
  }));
}
