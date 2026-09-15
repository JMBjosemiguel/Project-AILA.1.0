import { useState } from 'react';
import StudentSidebar from './StudentSidebar';
import StudentTopbar from './StudentTopbar';
import { useMobileDrawer } from '../../hooks/useMobileDrawer';

export default function StudentLayout({ active, onNavigate, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);
  useMobileDrawer(sidebarOpen, closeSidebar);

  return (
    <div className="min-h-screen flex bg-canvas">
      <StudentSidebar
        active={active}
        onNavigate={(id) => { onNavigate(id); setSidebarOpen(false); }}
        open={sidebarOpen}
        onClose={closeSidebar}
      />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-ink-800/40 z-[90] lg:hidden" onClick={closeSidebar} aria-hidden="true" />
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <StudentTopbar active={active} sidebarOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} onNavigate={onNavigate} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
