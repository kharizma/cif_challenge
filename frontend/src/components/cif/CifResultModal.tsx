import { Upload } from 'lucide-react';
import type { CifCheckResult } from '../../types';
import { STATUS_STYLES, formatRupiah } from '../../lib/cif';
import Modal from '../ui/Modal';

interface CifResultModalProps {
  result: CifCheckResult;
  onUpload: () => void;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-neutral-100 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

export default function CifResultModal({ result, onUpload, onClose }: CifResultModalProps) {
  const { customer } = result;

  return (
    <Modal
      title="Hasil Pengajuan"
      description={customer.applicationId ?? '-'}
      onClose={onClose}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Tutup
          </button>
          {result.status === 'REFER' && (
            <button
              type="button"
              onClick={onUpload}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
            >
              <Upload size={15} />
              Upload Dokumen
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2">
          <span className="text-sm text-neutral-500">Keputusan</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[result.status]}`}>
            {result.status}
          </span>
        </div>
        {result.status === 'REFER' && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Status REFER wajib upload dokumen. Setelah dokumen diunggah, pengajuan masuk antrean analis kredit.
          </p>
        )}
        <dl>
          <Row label="Application ID" value={customer.applicationId ?? '-'} />
          <Row label="Nama Lengkap" value={customer.fullName} />
          <Row label="Jumlah Pinjaman" value={formatRupiah(customer.loanAmount)} />
          <Row label="Identity Confidence" value={`${result.identityConfidence ?? 0}%`} />
          <Row label="Credit Score" value={result.creditScore == null ? '-' : String(result.creditScore)} />
          <Row label="NO CIF" value={result.matchedNoCif ?? '-'} />
          <Row label="Grade" value={result.decision ?? '-'} />
          <Row label="Reason" value={result.reason ?? '-'} />
        </dl>
      </div>
    </Modal>
  );
}
