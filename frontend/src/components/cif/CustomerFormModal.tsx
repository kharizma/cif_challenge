import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import Field, { inputClass } from '../ui/Field';
import Modal from '../ui/Modal';
import {
  EMPTY_FORM,
  creditTypeOptions,
  hasErrors,
  maritalStatusOptions,
  tenorOptions,
  validateCustomer,
} from '../../lib/cif';
import type { Customer, CustomerFormErrors, CustomerFormValues } from '../../types';

interface CustomerFormModalProps {
  customer: Customer | null;
  onClose: () => void;
  onSubmit: (values: CustomerFormValues) => void;
  busy?: boolean;
  error?: string | null;
}

function toFormValues(customer: Customer | null): CustomerFormValues {
  if (!customer) return EMPTY_FORM;
  return {
    fullName: customer.fullName,
    nik: customer.nik,
    birthDate: customer.birthDate,
    phone: customer.phone,
    maritalStatus: customer.maritalStatus,
    creditType: customer.creditType,
    loanAmount: String(customer.loanAmount),
    tenor: customer.tenor,
  };
}

export default function CustomerFormModal({
  customer,
  onClose,
  onSubmit,
  busy = false,
  error = null,
}: CustomerFormModalProps) {
  const [values, setValues] = useState<CustomerFormValues>(() => toFormValues(customer));
  const [errors, setErrors] = useState<CustomerFormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const update = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validateCustomer(next));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateCustomer(values);
    setSubmitted(true);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;
    onSubmit(values);
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="h-10 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Batal
      </button>
      <button
        type="submit"
        form="customer-form"
        disabled={busy}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        {busy ? 'Memproses…' : 'Simpan'}
      </button>
    </div>
  );

  return (
    <Modal
      title={customer ? 'Edit Customer' : 'Add Customer'}
      description={
        customer ? 'Perbarui data customer lalu simpan.' : 'Lengkapi data customer. Kolom bertanda * wajib diisi.'
      }
      onClose={onClose}
      footer={footer}
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <form id="customer-form" onSubmit={handleSubmit} noValidate className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Personal Information
          </legend>
          <Field id="fullName" label="Nama Lengkap" required error={errors.fullName}>
            <input
              id="fullName"
              value={values.fullName}
              onChange={(event) => update('fullName', event.target.value)}
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={errors.fullName ? 'fullName-error' : undefined}
              placeholder="Nama sesuai KTP"
              className={inputClass(Boolean(errors.fullName))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="nik" label="NIK" required error={errors.nik}>
              <input
                id="nik"
                value={values.nik}
                onChange={(event) => update('nik', event.target.value.replace(/\D/g, '').slice(0, 16))}
                inputMode="numeric"
                aria-invalid={Boolean(errors.nik)}
                aria-describedby={errors.nik ? 'nik-error' : undefined}
                placeholder="16 digit angka"
                className={inputClass(Boolean(errors.nik))}
              />
            </Field>
            <Field id="birthDate" label="Tanggal Lahir" required error={errors.birthDate}>
              <input
                id="birthDate"
                type="date"
                value={values.birthDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => update('birthDate', event.target.value)}
                aria-invalid={Boolean(errors.birthDate)}
                aria-describedby={errors.birthDate ? 'birthDate-error' : undefined}
                className={inputClass(Boolean(errors.birthDate))}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Contact Information
          </legend>
          <Field id="phone" label="Phone Number" error={errors.phone}>
            <input
              id="phone"
              type="tel"
              value={values.phone}
              onChange={(event) => update('phone', event.target.value.trim())}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'phone-error' : undefined}
              placeholder="08xxxxxxxxxx"
              className={inputClass(Boolean(errors.phone))}
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Additional Information
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="maritalStatus" label="Status Perkawinan" required error={errors.maritalStatus}>
              <select
                id="maritalStatus"
                value={values.maritalStatus}
                onChange={(event) =>
                  update('maritalStatus', event.target.value as CustomerFormValues['maritalStatus'])
                }
                aria-invalid={Boolean(errors.maritalStatus)}
                aria-describedby={errors.maritalStatus ? 'maritalStatus-error' : undefined}
                className={inputClass(Boolean(errors.maritalStatus))}
              >
                <option value="">Pilih status</option>
                {maritalStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="creditType" label="Jenis Kredit" required error={errors.creditType}>
              <select
                id="creditType"
                value={values.creditType}
                onChange={(event) =>
                  update('creditType', event.target.value as CustomerFormValues['creditType'])
                }
                aria-invalid={Boolean(errors.creditType)}
                aria-describedby={errors.creditType ? 'creditType-error' : undefined}
                className={inputClass(Boolean(errors.creditType))}
              >
                <option value="">Pilih jenis kredit</option>
                {creditTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="loanAmount" label="Jumlah Pinjaman" required error={errors.loanAmount}>
              <input
                id="loanAmount"
                type="number"
                min={5_000_000}
                max={500_000_000}
                step={1}
                value={values.loanAmount}
                onChange={(event) => update('loanAmount', event.target.value)}
                aria-invalid={Boolean(errors.loanAmount)}
                aria-describedby={errors.loanAmount ? 'loanAmount-error' : undefined}
                placeholder="5000000 - 500000000"
                className={inputClass(Boolean(errors.loanAmount))}
              />
            </Field>
            <Field id="tenor" label="Tenor" required error={errors.tenor}>
              <select
                id="tenor"
                value={values.tenor}
                onChange={(event) =>
                  update('tenor', event.target.value === '' ? '' : (Number(event.target.value) as CustomerFormValues['tenor']))
                }
                aria-invalid={Boolean(errors.tenor)}
                aria-describedby={errors.tenor ? 'tenor-error' : undefined}
                className={inputClass(Boolean(errors.tenor))}
              >
                <option value="">Pilih tenor</option>
                {tenorOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} bulan
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
