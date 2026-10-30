import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/cif-form': 'CIF Form',
};

interface TopNavProps {
  collapsed: boolean;
  onToggleSidebar: () => void;
}

export default function TopNav({ collapsed, onToggleSidebar }: TopNavProps) {
  const { pathname } = useLocation();
  const current = ROUTE_LABELS[pathname] ?? 'Page';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
      >
        <span className="hidden lg:block">
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </span>
        <span className="lg:hidden">
          <Menu size={18} />
        </span>
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm">
          <li>
            <Link to="/dashboard" className="text-neutral-500 transition-colors hover:text-neutral-900">
              Home
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight size={14} className="text-neutral-300" />
          </li>
          <li className="truncate font-medium text-neutral-900">{current}</li>
        </ol>
      </nav>
    </header>
  );
}
