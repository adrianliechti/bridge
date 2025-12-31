import { useState, type ReactNode } from 'react';
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
  // Detect changes during render to avoid synchronous setState in effects
  // Compute effective mode: if docker mode is set but docker not available, use kubernetes
  const effectiveMode: AppMode = (mode === 'docker' && !dockerAvailable) ? 'kubernetes' : mode;
  
  // Sync the state if there's a mismatch (will cause one extra render)
  if (mode !== effectiveMode) {
    setModeState(effectiveMode);
  }

  return (
    <AppModeContext.Provider value={{ mode: effectiveMode, setMode, dockerAvailable }}>
      {children}
    </AppModeContext.Provider>
  );
}
