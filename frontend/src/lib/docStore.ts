import type { CustomerStatus, DocumentRecord } from '../types';

const DB_NAME = 'cif-docs';
const STORE = 'blobs';
const DOCS_KEY = 'cif.documents';

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];
export const ACCEPT_ATTR = '.jpg,.jpeg,.png,.pdf';
export const MAX_CONCURRENT_UPLOADS = 3;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function loadDocumentMap(): Record<string, DocumentRecord[]> {
  try {
    const raw = localStorage.getItem(DOCS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, DocumentRecord[]>;
  } catch {
    return {};
  }
}

export function saveDocumentMap(map: Record<string, DocumentRecord[]>): void {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(map));
  } catch {
    // quota or privacy mode: upload state stays in memory only
  }
}

export function computeDocumentStatus(
  status: CustomerStatus,
  uploadedCount: number,
): 'N/A' | 'Optional' | 'Uploaded' | 'Incompleted' {
  if (status === 'NOT PASS') return 'N/A';
  if (uploadedCount > 0) return 'Uploaded';
  return status === 'REFER' ? 'Incompleted' : 'Optional';
}

export const DOC_STATUS_STYLES: Record<string, string> = {
  Uploaded: 'bg-emerald-50 text-emerald-700',
  Optional: 'bg-neutral-100 text-neutral-600',
  Incompleted: 'bg-amber-50 text-amber-700',
  'N/A': 'bg-neutral-100 text-neutral-400',
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
