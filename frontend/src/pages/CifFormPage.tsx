import PageHeader from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/States';

export default function CifFormPage() {
  return (
    <>
      <PageHeader title="CIF Form" description="Create and manage customer information forms." />
      <div className="rounded-xl border border-neutral-200 bg-white">
        <EmptyState title="No CIF forms yet" description="Forms you create will show up here." />
      </div>
    </>
  );
}
