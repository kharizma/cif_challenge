import { FileStack, LayoutDashboard } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { NavItem } from '../../types';

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'CIF Form', to: '/cif-form', icon: FileStack },
];

interface SidebarProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export default function Sidebar({ collapsed, onNavigate }: SidebarProps) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div
        className={`flex h-16 shrink-0 items-center gap-3 border-b border-neutral-200 px-4 ${
          collapsed ? 'justify-center px-0' : ''
        }`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-sm font-bold text-white">
          C
        </span>
        {!collapsed && (
          <span className="truncate text-[15px] font-semibold tracking-tight">CIF APP</span>
        )}
      </div>

      {/* Collapsed nav must not clip tooltips, so it cannot scroll; many items would need a portal tooltip. */}
      <nav
        className={`flex-1 space-y-1 px-3 py-4 ${collapsed ? 'overflow-visible' : 'overflow-y-auto'}`}
      >
        {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                'group relative flex h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-0' : 'px-3',
                isActive
                  ? 'bg-accent-soft text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={18}
                  strokeWidth={2}
                  className={isActive ? 'text-accent-dark' : 'text-neutral-500'}
                />
                {!collapsed && <span className="truncate">{label}</span>}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full z-20 ml-3 hidden whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white group-hover:block">
                    {label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-neutral-200 p-3">
        <p className={`truncate text-xs text-neutral-400 ${collapsed ? 'text-center' : ''}`}>
          {collapsed ? 'v0.1' : 'CIF APP v0.1'}
        </p>
      </div>
    </div>
  );
}
