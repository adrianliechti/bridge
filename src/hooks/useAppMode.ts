import { useContext } from 'react';
import { AppModeContext, type AppModeContextValue } from '../context/appModeContext';

export function useAppMode(): AppModeContextValue {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error('useAppMode must be used within an AppModeProvider');
  }
  return context;
}
