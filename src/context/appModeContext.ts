import { createContext } from 'react';

export type AppMode = 'kubernetes' | 'docker';

export interface AppModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  dockerAvailable: boolean;
}

export const AppModeContext = createContext<AppModeContextValue | null>(null);
