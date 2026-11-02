import type { CifCheckResult } from '../../types';
import Modal from '../ui/Modal';
import CifSummary from './CifSummary';

interface CifResultModalProps {
  result: CifCheckResult;
  onClose: () => void;
}

export default function CifResultModal({ result, onClose }: CifResultModalProps) {
  // Nilai level hasil dipakai lebih dulu, customer sebagai cadangan.
  const summary = {
    ...result.customer,
    status: result.status,
    decision: result.decision ?? result.customer.decision,
    reason: result.reason ?? result.customer.reason,
    identityConfidence: result.identityConfidence ?? result.customer.identityConfidence,
    creditScore: result.creditScore ?? result.customer.creditScore,
    matchedNoCif: result.matchedNoCif ?? result.customer.matchedNoCif,
  };

  return (
    <Modal
      title="Hasil Pengajuan"
      description={result.customer.applicationId ?? '-'}
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
        </div>
      }
    >
      <CifSummary customer={summary} />
    </Modal>
  );
}
