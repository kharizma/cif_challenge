import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNav from './TopNav';

const STORAGE_KEY = 'cif.sidebar.collapsed';

export default function AppLayout() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleToggle = () => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setMobileOpen((open) => !open);
      return;
    }
    setCollapsed((value) => !value);
  };

  return (
    <div className="min-h-screen bg-white">
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-neutral-200 transition-[width] duration-200 lg:block ${
          collapsed ? 'w-[76px]' : 'w-[264px]'
        }`}
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-neutral-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-[264px] border-r border-neutral-200 bg-white shadow-xl">
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div
        className={`transition-[padding] duration-200 ${
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]'
        }`}
      >
        <TopNav collapsed={collapsed} onToggleSidebar={handleToggle} />
        <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
