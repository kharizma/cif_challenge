import { formatDate, formatRupiah } from '../../lib/cif';
import type { ReactNode } from 'react';
import type { Customer } from '../../types';
import Modal from '../ui/Modal';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-neutral-100 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

export default function CustomerDetailModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  return (
    <Modal title="Customer Detail" description={customer.fullName} onClose={onClose}>
      <div className="space-y-5">
        <Section title="Personal Information">
          <Row label="Nama Lengkap" value={customer.fullName} />
          <Row label="NIK" value={customer.nik} />
          <Row label="Tanggal Lahir" value={customer.birthDate} />
        </Section>
        <Section title="Contact Information">
          <Row label="Phone Number" value={customer.phone || '-'} />
        </Section>
        <Section title="Additional Information">
          <Row label="Status Perkawinan" value={customer.maritalStatus} />
          <Row label="Jenis Kredit" value={customer.creditType} />
          <Row label="Jumlah Pinjaman" value={formatRupiah(customer.loanAmount)} />
          <Row label="Tenor" value={`${customer.tenor} bulan`} />
          <Row label="Created At" value={formatDate(customer.createdAt)} />
          <Row label="Status" value={customer.status} />
          <Row label="Docs" value={customer.docs} />
        </Section>
      </div>
    </Modal>
  );
}
