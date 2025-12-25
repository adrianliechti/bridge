import { useState, useCallback, type ReactNode, useMemo } from 'react';
import { PanelContext } from './panelContext';

export function PanelProvider({ children }: { children: ReactNode }) {
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());

  const isOpen = useCallback((panelId: string) => {
    return openPanels.has(panelId);
  }, [openPanels]);

  const open = useCallback((panelId: string) => {
    setOpenPanels(prev => {
      const next = new Set(prev);
      next.add(panelId);
      return next;
    });
  }, []);

  const close = useCallback((panelId: string) => {
    setOpenPanels(prev => {
      const next = new Set(prev);
      next.delete(panelId);
      return next;
    });
  }, []);

  const toggle = useCallback((panelId: string) => {
    setOpenPanels(prev => {
      const next = new Set(prev);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    openPanels,
    isOpen,
    open,
    close,
    toggle,
  }), [openPanels, isOpen, open, close, toggle]);

  return (
    <PanelContext.Provider value={value}>
      {children}
    </PanelContext.Provider>
  );
}
