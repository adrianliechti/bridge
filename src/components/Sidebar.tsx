import type { ReactNode } from 'react';

/**
 * The window's flush, full-height sidebar. Its top row shares the 48px title
 * bar row: the macOS traffic lights sit there, other platforms show the name.
 */
export function Sidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="sidebar w-60 shrink-0">
      <div className="sidebar-titlebar">
        <span className="sidebar-title">Bridge</span>
      </div>
      {children}
    </aside>
  );
}
