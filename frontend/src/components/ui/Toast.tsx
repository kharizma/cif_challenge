import { CheckCircle2 } from 'lucide-react';
import { useEffect } from 'react';

export default function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900"
    >
      <CheckCircle2 size={16} className="text-emerald-600" />
      {message}
    </div>
  );
}
