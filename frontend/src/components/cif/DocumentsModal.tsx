import { Eye, FileText, Loader2, RefreshCw, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import Modal from '../ui/Modal';
import {
  ACCEPTED_MIME,
  ACCEPT_ATTR,
  MAX_CONCURRENT_UPLOADS,
  MAX_FILE_SIZE,
  formatBytes,
  getBlob,
  saveBlob,
} from '../../lib/docStore';
import { apiErrorMessage, fetchUploadBlob, uploadCifDocument } from '../../services/api';
import { DOCUMENT_TYPES } from '../../types';
import type { Customer, DocumentRecord, DocumentType } from '../../types';

const STATUS_LABEL: Record<DocumentRecord['status'], string> = {
  waiting: 'Menunggu',
  uploading: 'Mengunggah',
  success: 'Berhasil',
  failed: 'Gagal',
};

const STATUS_STYLE: Record<DocumentRecord['status'], string> = {
  waiting: 'bg-neutral-100 text-neutral-600',
  uploading: 'bg-accent-soft text-accent-dark',
  success: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
};

interface DocumentsModalProps {
  customer: Customer;
  records: DocumentRecord[];
  onClose: () => void;
}

export default function DocumentsModal({ customer, records, onClose }: DocumentsModalProps) {
  const [queue, setQueue] = useState<DocumentRecord[]>(() =>
    records.map((record) =>
      record.status === 'uploading' ? { ...record, status: 'waiting' as const } : record,
    ),
  );
  const [docType, setDocType] = useState<DocumentType>('KTP');
  const [formError, setFormError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null);

  const active = useRef<Set<string>>(new Set());
  const queueRef = useRef(queue);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const pump = useCallback(() => {
    const slots = MAX_CONCURRENT_UPLOADS - active.current.size;
    if (slots <= 0) return;
    queueRef.current
      .filter((record) => record.status === 'waiting' && !active.current.has(record.id))
      .slice(0, slots)
      .forEach((record) => void upload(record));
  }, []);

  async function blobFor(record: DocumentRecord): Promise<Blob | null> {
    if (record.serverId) {
      if (!customer.applicationId) throw new Error('Application ID tidak tersedia.');
      return fetchUploadBlob(customer.applicationId, record.serverId);
    }
    return getBlob(record.id);
  }

  async function upload(record: DocumentRecord) {
    active.current.add(record.id);
    setQueue((list) =>
      list.map((item) =>
        item.id === record.id ? { ...item, status: 'uploading', error: undefined } : item,
      ),
    );

    try {
      if (!customer.applicationId) throw new Error('Application ID tidak tersedia.');
      const blob = await getBlob(record.id);
      if (!blob) throw new Error('File tidak tersedia. Pilih ulang file ini.');

      const uploaded = await uploadCifDocument(
        customer.applicationId,
        record.type,
        blob,
        record.fileName,
      );
      setQueue((list) =>
        list.map((item) =>
          item.id === record.id
            ? {
                ...item,
                serverId: uploaded.id,
                uploadedBytes: record.size,
                status: 'success',
                error: undefined,
              }
            : item,
        ),
      );
    } catch (error) {
      setQueue((list) =>
        list.map((item) =>
          item.id === record.id
            ? { ...item, status: 'failed', error: apiErrorMessage(error) }
            : item,
        ),
      );
    } finally {
      active.current.delete(record.id);
      pump();
    }
  }

  useEffect(() => {
    pump();
  }, [queue, pump]);

  useEffect(() => {
    let cancelled = false;
    const images = queue.filter((record) => record.status === 'success' && record.mime.startsWith('image/'));
    void Promise.all(
      images.map(async (record) => {
        if (thumbs[record.id]) return null;
        const blob = await blobFor(record);
        return blob ? ([record.id, URL.createObjectURL(blob)] as const) : null;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next = Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
      if (Object.keys(next).length > 0) setThumbs((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  useEffect(
    () => () => {
      Object.values(thumbs).forEach((url) => URL.revokeObjectURL(url));
    },
    [thumbs],
  );

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const rejected: string[] = [];
    const accepted: { record: DocumentRecord; blob: Blob }[] = [];

    files.forEach((file) => {
      if (!ACCEPTED_MIME.includes(file.type)) {
        rejected.push(`${file.name}: tipe harus JPG, PNG, atau PDF`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name}: ukuran melebihi 20 MB`);
        return;
      }
      accepted.push({
        record: {
          id: crypto.randomUUID(),
          customerId: customer.id,
          type: docType,
          fileName: file.name,
          mime: file.type,
          size: file.size,
          uploadedBytes: 0,
          status: 'waiting',
          createdAt: new Date().toISOString(),
        },
        blob: file,
      });
    });

    setFormError(rejected.length > 0 ? rejected.join('. ') : null);
    if (accepted.length === 0) return;

    setPreparing(true);
    try {
      await Promise.all(accepted.map(({ record, blob }) => saveBlob(record.id, blob)));
      setQueue((list) => [...list, ...accepted.map(({ record }) => record)]);
    } catch {
      setFormError('Gagal menyimpan file di perangkat. Coba pilih ulang.');
    } finally {
      setPreparing(false);
    }
  };

  const retry = (id: string) => {
    setQueue((list) =>
      list.map((item) => (item.id === id ? { ...item, status: 'waiting', error: undefined } : item)),
    );
  };

  const openPreview = async (record: DocumentRecord) => {
    try {
      const blob = await blobFor(record);
      if (!blob) {
        setFormError('File tidak ditemukan.');
        return;
      }
      setPreview({ url: URL.createObjectURL(blob), name: record.fileName, mime: record.mime });
    } catch (error) {
      setFormError(apiErrorMessage(error));
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const requestClose = () => {
    if (!preparing) onClose();
  };

  const uploadedCount = queue.filter((record) => record.status === 'success').length;
  const totalBytes = queue.reduce((sum, record) => sum + record.size, 0);
  const loadedBytes = queue.reduce((sum, record) => sum + record.uploadedBytes, 0);
  const totalPercent = totalBytes === 0 ? 0 : Math.round((loadedBytes / totalBytes) * 100);
  const uploadsRunning = queue.some(
    (record) => record.status === 'uploading' || record.status === 'waiting',
  );

  return (
    <Modal
      title={`Dokumen ${customer.fullName}`}
      description="Unggah dokumen pendukung. JPG, PNG, atau PDF."
      onClose={requestClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            {preparing
              ? 'Menyiapkan file…'
              : uploadsRunning
                ? 'Upload berjalan. Tutup modal aman, progres tersimpan.'
                : `${uploadedCount} file berhasil`}
          </p>
          <button
            type="button"
            onClick={requestClose}
            disabled={preparing}
            className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            Selesai
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {customer.status === 'REFER' && uploadedCount === 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Status REFER wajib upload dokumen.
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-44">
            <label htmlFor="docType" className="mb-1.5 block text-sm font-medium text-neutral-700">
              Jenis dokumen
            </label>
            <select
              id="docType"
              value={docType}
              onChange={(event) => setDocType(event.target.value as DocumentType)}
              className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm hover:border-neutral-300 focus:border-accent"
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">
            {preparing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {preparing ? 'Menyiapkan…' : 'Pilih file'}
            <input
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              onChange={(event) => void handleFiles(event)}
              className="sr-only"
            />
          </label>
          <p className="pb-2 text-xs text-neutral-500">Maks 20 MB per file, 3 unggahan bersamaan.</p>
        </div>

        {formError && <p className="text-xs text-red-600">{formError}</p>}

        {queue.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-500">
            Belum ada dokumen diunggah.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                <span>Progress total</span>
                <span>
                  {totalPercent}% · {formatBytes(loadedBytes)} / {formatBytes(totalBytes)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${totalPercent}%` }}
                />
              </div>
            </div>

            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
              {queue.map((record) => {
                const percent =
                  record.size === 0 ? 0 : Math.round((record.uploadedBytes / record.size) * 100);
                return (
                  <li key={record.id} className="flex gap-3 p-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                      {thumbs[record.id] ? (
                        <img src={thumbs[record.id]} alt={record.fileName} className="h-full w-full object-cover" />
                      ) : (
                        <FileText size={18} className="text-neutral-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-neutral-900">{record.fileName}</p>
                          <p className="text-xs text-neutral-500">
                            {record.type} · {formatBytes(record.size)}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[record.status]}`}>
                          {STATUS_LABEL[record.status]}
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-100">
                          <div
                            className={`h-full rounded-full transition-[width] ${
                              record.status === 'failed' ? 'bg-red-500' : 'bg-accent'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="w-9 text-right text-xs text-neutral-500">{percent}%</span>
                        {record.status === 'success' && (
                          <button
                            type="button"
                            onClick={() => void openPreview(record)}
                            aria-label={`Lihat ${record.fileName}`}
                            className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                          >
                            <Eye size={14} />
                          </button>
                        )}
                        {record.status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => retry(record.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                          >
                            <RefreshCw size={12} />
                            Retry
                          </button>
                        )}
                        {record.status === 'uploading' && (
                          <Loader2 size={14} className="animate-spin text-accent-dark" />
                        )}
                      </div>
                      {record.error && <p className="mt-1 text-xs text-red-600">{record.error}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-neutral-900/60 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <p className="truncate text-sm font-medium">{preview.name}</p>
              <button
                type="button"
                onClick={closePreview}
                aria-label="Tutup preview"
                className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-neutral-50 p-3">
              {preview.mime.startsWith('image/') ? (
                <img src={preview.url} alt={preview.name} className="mx-auto max-h-[65vh] w-auto" />
              ) : (
                <iframe src={preview.url} title={preview.name} className="h-[65vh] w-full rounded-lg bg-white" />
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
