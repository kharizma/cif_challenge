import type { Customer } from '../../types';
import { STATUS_STYLES, formatRupiah } from '../../lib/cif';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-neutral-100 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

// Ringkasan hasil pengajuan, dipakai modal hasil dan modal upload dokumen.
export default function CifSummary({ customer }: { customer: Customer }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2">
        <span className="text-sm text-neutral-500">Keputusan</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[customer.status]}`}>
          {customer.status}
        </span>
      </div>
      {customer.status === 'REFER' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Status REFER wajib upload dokumen. Setelah dokumen diunggah, pengajuan masuk antrean analis kredit.
        </p>
      )}
      <dl>
        <Row label="Application ID" value={customer.applicationId ?? '-'} />
        <Row label="Nama Lengkap" value={customer.fullName} />
        <Row label="Jumlah Pinjaman" value={formatRupiah(customer.loanAmount)} />
        <Row label="Identity Confidence" value={`${customer.identityConfidence ?? 0}%`} />
        <Row label="Credit Score" value={customer.creditScore == null ? '-' : String(customer.creditScore)} />
        <Row label="NO CIF" value={customer.matchedNoCif ?? '-'} />
        <Row label="Grade" value={customer.decision ?? '-'} />
        <Row label="Reason" value={customer.reason ?? '-'} />
      </dl>
    </div>
  );
}
