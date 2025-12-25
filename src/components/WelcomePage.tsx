import { Hexagon, Layers, Database, Zap } from 'lucide-react';

export function WelcomePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-2xl mx-auto px-8 text-center">
        {/* Logo / Icon */}
        <div className="mb-8 relative">
          <div className="w-24 h-24 mx-auto rounded-2xl bg-linear-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/25">
            <Hexagon size={48} className="text-white" strokeWidth={1.5} />
          </div>
        </div>

        {/* Welcome text */}
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-10">
          Visualize and explore your Kubernetes cluster resources
        </p>

        {/* Feature cards */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="p-4 bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50">
            <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
              <Layers size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Topology View</h3>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              See resource relationships and dependencies at a glance
            </p>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50">
            <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-sky-100 dark:bg-sky-500/20 flex items-center justify-center">
              <Database size={20} className="text-sky-600 dark:text-sky-400" />
            </div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Resource Browser</h3>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Browse and inspect any Kubernetes resource type
            </p>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50">
            <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
              <Zap size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Quick Details</h3>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Click any resource to see its full specification
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WelcomePage;
