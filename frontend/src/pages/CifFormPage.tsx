import { Eye, FileUp, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ConfirmDialog from '../components/cif/ConfirmDialog';
import CustomerDetailModal from '../components/cif/CustomerDetailModal';
import CustomerFormModal from '../components/cif/CustomerFormModal';
import DocumentsModal from '../components/cif/DocumentsModal';
import PageHeader from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/States';
import Toast from '../components/ui/Toast';
import { initialCustomers } from '../data/customers';
import {
  DOCS_STYLES,
  STATUS_STYLES,
  formatDate,
  formatRupiah,
  maskNik,
} from '../lib/cif';
import {
  DOC_STATUS_STYLES,
  computeDocumentStatus,
  loadDocumentMap,
  saveDocumentMap,
} from '../lib/docStore';
import type { Customer, CustomerFormValues, DocumentRecord } from '../types';

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; customer: Customer }
  | { type: 'view'; customer: Customer }
  | { type: 'delete'; customer: Customer }
  | { type: 'documents'; customer: Customer }
  | null;

export default function CifFormPage() {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [searching, setSearching] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Record<string, DocumentRecord[]>>(() => loadDocumentMap());

  const handleDocumentsChange = useCallback((customerId: string, records: DocumentRecord[]) => {
    setDocuments((prev) => {
      const next = { ...prev, [customerId]: records };
      saveDocumentMap(next);
      return next;
    });
  }, []);

  const documentsStatus = (customer: Customer) =>
    computeDocumentStatus(
      customer.status,
      (documents[customer.id] ?? []).filter((record) => record.status === 'success').length,
    );

  // shortcut: local dataset with 400ms simulated search; swap for API call when backend endpoint exists.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setApplied('');
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      setApplied(term.toLowerCase());
      setSearching(false);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    if (!applied) return customers;
    return customers.filter((customer) =>
      [customer.fullName, customer.nik, customer.phone]
        .join(' ')
        .toLowerCase()
        .includes(applied),
    );
  }, [customers, applied]);

  const closeModal = useCallback(() => setModal(null), []);

  const handleSubmit = (values: CustomerFormValues) => {
    const isEdit = modal?.type === 'edit';
    const record: Customer = {
      id: isEdit && modal.type === 'edit' ? modal.customer.id : crypto.randomUUID(),
      fullName: values.fullName.trim(),
      nik: values.nik.trim(),
      birthDate: values.birthDate,
      phone: values.phone.trim(),
      maritalStatus: values.maritalStatus as Customer['maritalStatus'],
      creditType: values.creditType as Customer['creditType'],
      loanAmount: Number(values.loanAmount),
      tenor: Number(values.tenor) as Customer['tenor'],
      status: isEdit && modal.type === 'edit' ? modal.customer.status : 'REFER',
      docs: isEdit && modal.type === 'edit' ? modal.customer.docs : 'EMPTY',
      createdAt:
        isEdit && modal.type === 'edit' ? modal.customer.createdAt : new Date().toISOString(),
    };

    setCustomers((list) =>
      isEdit ? list.map((item) => (item.id === record.id ? record : item)) : [record, ...list],
    );
    setModal(null);
    setToast(isEdit ? 'Customer berhasil diperbarui.' : 'Customer berhasil ditambahkan.');
  };

  const handleDelete = () => {
    if (modal?.type !== 'delete') return;
    setCustomers((list) => list.filter((item) => item.id !== modal.customer.id));
    setModal(null);
    setToast('Customer berhasil dihapus.');
  };

  return (
    <>
      <PageHeader
        title="CIF Form"
        description="Kelola data customer dan pengajuan kredit."
        action={
          <button
            type="button"
            onClick={() => setModal({ type: 'add' })}
            className="inline-flex h-10 items-center gap-1.5 self-start rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
          >
            <Plus size={16} />
            Add Customer
          </button>
        }
      />

      <section className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-neutral-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Customer Data</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {filtered.length} dari {customers.length} customer
            </p>
          </div>
          <div className="relative sm:w-72">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama, NIK, atau telepon"
              aria-label="Cari customer"
              className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-9 text-sm transition-colors placeholder:text-neutral-400 hover:border-neutral-300 focus:border-accent"
            />
            {searching && (
              <Loader2
                size={15}
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-accent-dark"
              />
            )}
          </div>
        </div>

        {customers.length === 0 ? (
          <EmptyState title="Belum ada customer" description="Tambahkan customer pertamamu." />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={searching ? 'Mencari data' : 'Customer tidak ditemukan'}
            description={searching ? 'Minimal 3 karakter, tunggu sebentar.' : 'Coba kata kunci lain.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-2.5 py-2.5 font-medium">NIK</th>
                  <th className="px-2.5 py-2.5 font-medium">Phone Number</th>
                  <th className="px-2.5 py-2.5 font-medium">Nama Lengkap</th>
                  <th className="hidden px-2.5 py-2.5 font-medium 2xl:table-cell">Status Perkawinan</th>
                  <th className="hidden px-2.5 py-2.5 font-medium 2xl:table-cell">Jenis Kredit</th>
                  <th className="px-2.5 py-2.5 font-medium">Jumlah Pinjaman</th>
                  <th className="px-2.5 py-2.5 font-medium">Tenor</th>
                  <th className="px-2.5 py-2.5 font-medium">Status</th>
                  <th className="px-2.5 py-2.5 font-medium">Document Status</th>
                  <th className="hidden px-2.5 py-2.5 font-medium 2xl:table-cell">Docs</th>
                  <th className="hidden px-2.5 py-2.5 font-medium 2xl:table-cell">Created At</th>
                  <th className="px-2.5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filtered.map((customer) => (
                  <tr key={customer.id} className="transition-colors hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-2.5 py-3 font-mono text-xs text-neutral-700">
                      {maskNik(customer.nik)}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-neutral-600">
                      {customer.phone || '-'}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3 font-medium text-neutral-900">
                      {customer.fullName}
                    </td>
                    <td className="hidden whitespace-nowrap px-2.5 py-3 text-neutral-600 2xl:table-cell">
                      {customer.maritalStatus}
                    </td>
                    <td className="hidden whitespace-nowrap px-2.5 py-3 text-neutral-600 2xl:table-cell">
                      {customer.creditType}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-neutral-600">
                      {formatRupiah(customer.loanAmount)}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-neutral-600">
                      {customer.tenor} bln
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[customer.status]}`}
                      >
                        {customer.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          DOC_STATUS_STYLES[documentsStatus(customer)]
                        }`}
                      >
                        {documentsStatus(customer)}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-2.5 py-3 2xl:table-cell">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOCS_STYLES[customer.docs]}`}
                      >
                        {customer.docs}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-2.5 py-3 text-neutral-500 2xl:table-cell">
                      {formatDate(customer.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'documents', customer })}
                          aria-label={`Dokumen ${customer.fullName}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                          <FileUp size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'view', customer })}
                          aria-label={`Lihat ${customer.fullName}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'edit', customer })}
                          aria-label={`Edit ${customer.fullName}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'delete', customer })}
                          aria-label={`Hapus ${customer.fullName}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <CustomerFormModal
          customer={modal.type === 'edit' ? modal.customer : null}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
      {modal?.type === 'view' && (
        <CustomerDetailModal customer={modal.customer} onClose={closeModal} />
      )}
      {modal?.type === 'documents' && (
        <DocumentsModal
          customer={modal.customer}
          records={documents[modal.customer.id] ?? []}
          onChange={(records) => handleDocumentsChange(modal.customer.id, records)}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'delete' && (
        <ConfirmDialog
          title="Hapus customer"
          message={`Data ${modal.customer.fullName} akan dihapus permanen. Lanjutkan?`}
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onClose={closeModal}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
