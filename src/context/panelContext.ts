import { createContext } from 'react';

export interface PanelContextValue {
  openPanels: Set<string>;
  isOpen: (panelId: string) => boolean;
  open: (panelId: string) => void;
  close: (panelId: string) => void;
  toggle: (panelId: string) => void;
}

export const PanelContext = createContext<PanelContextValue | null>(null);
