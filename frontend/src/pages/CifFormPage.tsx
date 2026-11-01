import { ChevronLeft, ChevronRight, Eye, FileUp, Loader2, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CifResultModal from '../components/cif/CifResultModal';
import CustomerDetailModal from '../components/cif/CustomerDetailModal';
import CustomerFormModal from '../components/cif/CustomerFormModal';
import DocumentsModal from '../components/cif/DocumentsModal';
import PageHeader from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/States';
import Toast from '../components/ui/Toast';
import {
  DOCS_STYLES,
  STATUS_STYLES,
  documentRecords,
  formatDate,
  formatRupiah,
  maskNik,
} from '../lib/cif';
import { DOC_STATUS_STYLES, computeDocumentStatus } from '../lib/docStore';
import { apiErrorMessage, checkCif, fetchCifList } from '../services/api';
import type { CifCheckResult, Customer, CustomerFormValues, Pagination } from '../types';

type ModalState =
  | { type: 'add' }
  | { type: 'view'; customer: Customer }
  | { type: 'documents'; customer: Customer }
  | null;

const PAGE_SIZE = 10;

export default function CifFormPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [searching, setSearching] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [result, setResult] = useState<CifCheckResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async (page: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetchCifList(page, PAGE_SIZE);
      setCustomers(response.customers);
      setPagination(response.pagination);
    } catch (error) {
      setLoadError(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const documentsStatus = (customer: Customer) =>
    computeDocumentStatus(customer.status, customer.documents?.length ?? 0);

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

  const closeModal = useCallback(() => {
    setModal(null);
    setFormError(null);
  }, []);

  const handleSubmit = async (values: CustomerFormValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const check = await checkCif(values);
      setModal(null);
      setResult(check);
      setToast(`Pengajuan ${check.customer.applicationId ?? ''} ${check.status}.`);
      await load(1);
    } catch (error) {
      setFormError(apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const closeDocuments = () => {
    setModal(null);
    void load(pagination.page);
  };

  return (
    <>
      <PageHeader
        title="CIF Form"
        description="Kelola data customer dan pengajuan kredit."
        action={
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setModal({ type: 'add' });
            }}
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

        {loadError ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-red-600">{loadError}</p>
            <button
              type="button"
              onClick={() => void load(pagination.page)}
              className="mt-3 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Coba lagi
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-neutral-500">
            <Loader2 size={16} className="animate-spin" />
            Memuat data pengajuan…
          </div>
        ) : customers.length === 0 ? (
          <EmptyState title="Belum ada pengajuan" description="Tambahkan customer pertama." />
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
                      {customer.nik ? maskNik(customer.nik) : '-'}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !loadError && customers.length > 0 && (
          <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3 text-sm text-neutral-600">
            <span>
              Halaman {pagination.page} dari {Math.max(pagination.total_pages, 1)} · {pagination.total} pengajuan
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => void load(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 px-3 text-xs font-medium hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft size={14} />
                Prev
              </button>
              <button
                type="button"
                onClick={() => void load(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 px-3 text-xs font-medium hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      {modal?.type === 'add' && (
        <CustomerFormModal
          customer={null}
          onClose={closeModal}
          onSubmit={handleSubmit}
          busy={submitting}
          error={formError}
        />
      )}
      {modal?.type === 'view' && (
        <CustomerDetailModal customer={modal.customer} onClose={closeModal} />
      )}
      {modal?.type === 'documents' && (
        <DocumentsModal
          customer={modal.customer}
          records={documentRecords(modal.customer)}
          onClose={closeDocuments}
        />
      )}
      {result && (
        <CifResultModal
          result={result}
          onClose={() => setResult(null)}
          onUpload={() => {
            setModal({ type: 'documents', customer: result.customer });
            setResult(null);
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
