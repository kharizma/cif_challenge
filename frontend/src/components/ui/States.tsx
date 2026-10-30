import { AlertCircle, Inbox, Loader2 } from 'lucide-react';

export function LoadingState({ label = 'Loading data' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white py-16 text-center">
      <AlertCircle size={22} className="text-red-500" />
      <p className="text-sm text-neutral-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-neutral-50"
      >
        Try again
      </button>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <Inbox size={22} className="text-neutral-400" />
      <p className="text-sm font-medium text-neutral-700">{title}</p>
      <p className="text-sm text-neutral-500">{description}</p>
    </div>
  );
}
