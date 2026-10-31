import type { ReactNode } from 'react';

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}

export default function Field({ id, label, required, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-neutral-700">
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass = (invalid: boolean) =>
  [
    'h-10 w-full rounded-lg border bg-white px-3 text-sm text-neutral-900 transition-colors placeholder:text-neutral-400',
    invalid
      ? 'border-red-400 focus:border-red-500'
      : 'border-neutral-200 hover:border-neutral-300 focus:border-accent',
  ].join(' ');
