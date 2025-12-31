import { useState, useEffect, type ReactNode } from 'react';
import { AppModeContext, type AppMode } from './appModeContext';
import { getConfig } from '../config';

const STORAGE_KEY = 'bridge-app-mode';

interface AppModeProviderProps {
  children: ReactNode;
}

export function AppModeProvider({ children }: AppModeProviderProps) {
  const config = getConfig();
  const dockerAvailable = config.docker?.available ?? false;

  // Initialize mode from localStorage, defaulting to kubernetes
  const [mode, setModeState] = useState<AppMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Only use docker mode if it was stored AND docker is available
    if (stored === 'docker' && dockerAvailable) {
      return 'docker';
    }
    return 'kubernetes';
  });

  // Update mode and persist to localStorage
  const setMode = (newMode: AppMode) => {
    // Don't allow switching to docker if not available
    if (newMode === 'docker' && !dockerAvailable) {
      return;
    }
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  };

  // If docker becomes unavailable, switch back to kubernetes
  useEffect(() => {
    if (mode === 'docker' && !dockerAvailable) {
      setModeState('kubernetes');
    }
  }, [mode, dockerAvailable]);

  return (
    <AppModeContext.Provider value={{ mode, setMode, dockerAvailable }}>
      {children}
    </AppModeContext.Provider>
  );
}
