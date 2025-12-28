import { Layers, Database, Zap } from 'lucide-react';

export function WelcomePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="max-w-2xl mx-auto px-8 text-center">
        {/* Logo / Icon */}
        <div className="mb-8 relative">
          <img src="/logo.png" alt="Logo" className="w-70 h-70 mx-auto dark:hidden" />
          <img src="/logo_dark.png" alt="Logo" className="w-70 h-70 mx-auto hidden dark:block" />
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/30">
            <div className="w-9 h-9 mx-auto mb-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
              <Layers size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 mb-0.5">Topology</h3>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Resource relationships
            </p>
          </div>
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/30">
            <div className="w-9 h-9 mx-auto mb-2.5 rounded-lg bg-sky-100 dark:bg-sky-500/10 flex items-center justify-center">
              <Database size={18} className="text-sky-600 dark:text-sky-400" />
            </div>
            <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 mb-0.5">Browser</h3>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Browse any resource
            </p>
          </div>
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/30">
            <div className="w-9 h-9 mx-auto mb-2.5 rounded-lg bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center">
              <Zap size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 mb-0.5">Details</h3>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Full specifications
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
