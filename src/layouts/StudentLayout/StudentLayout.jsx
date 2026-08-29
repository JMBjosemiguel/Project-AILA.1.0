import { useState } from 'react';
import StudentSidebar from './StudentSidebar';
import StudentTopbar from './StudentTopbar';

export default function StudentLayout({ active, onNavigate, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-canvas">
      <StudentSidebar
        active={active}
        onNavigate={(id) => { onNavigate(id); setSidebarOpen(false); }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-ink-800/40 z-[90] lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <StudentTopbar active={active} onMenuClick={() => setSidebarOpen(true)} onNavigate={onNavigate} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
