import { useContext } from 'react';
import { PanelContext } from '../context/panelContext';

export function usePanels() {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanels must be used within a PanelProvider');
  }
  return context;
}
