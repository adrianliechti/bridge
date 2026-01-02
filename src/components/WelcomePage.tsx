import { useEffect, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { getConfig } from '../config';

export function WelcomePage() {
  const config = getConfig();
  const navigate = useNavigate();
  const k8sContexts = useMemo(() => config.kubernetes?.contexts || [], [config.kubernetes?.contexts]);
  const dockerContexts = useMemo(() => config.docker?.contexts || [], [config.docker?.contexts]);

  const hasKubernetes = k8sContexts.length > 0;
  const hasDocker = dockerContexts.length > 0;

  // Auto-redirect on mount
  useEffect(() => {
    // Priority 1: Kubernetes with default context or first available
    if (hasKubernetes) {
      const context = config.kubernetes?.defaultContext || k8sContexts[0];
      navigate({ to: '/cluster/$context', params: { context }, replace: true });
      return;
    }
    // Priority 2: Docker with default context or first available
    if (hasDocker) {
      const context = config.docker?.defaultContext || dockerContexts[0];
      navigate({ to: '/docker/$context', params: { context }, replace: true });
      return;
    }
  }, [hasKubernetes, hasDocker, config.kubernetes?.defaultContext, config.docker?.defaultContext, k8sContexts, dockerContexts, navigate]);

  // If nothing available, show empty state with guidance
  if (!hasKubernetes && !hasDocker) {
    return (
      <div className="flex h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="max-w-md mx-auto px-8 text-center">
            <div className="mb-6">
              <img src="/logo.png" alt="Logo" className="w-32 h-32 mx-auto dark:hidden opacity-50" />
              <img src="/logo_dark.png" alt="Logo" className="w-32 h-32 mx-auto hidden dark:block opacity-50" />
            </div>
            <h1 className="text-xl font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
              No Contexts Available
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              No Kubernetes or Docker contexts were found. Make sure your kubeconfig or Docker configuration is set up correctly.
            </p>
            <div className="text-left text-xs text-neutral-400 dark:text-neutral-500 space-y-2 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4">
              <p className="font-medium text-neutral-500 dark:text-neutral-400">Quick setup:</p>
              <p>• For Kubernetes: ensure <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded">~/.kube/config</code> exists</p>
              <p>• For Docker: ensure Docker Desktop or Docker Engine is running</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while redirecting
  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="mb-8">
          <img src="/logo.png" alt="Logo" className="w-32 h-32 mx-auto dark:hidden opacity-50" />
          <img src="/logo_dark.png" alt="Logo" className="w-32 h-32 mx-auto hidden dark:block opacity-50" />
        </div>
      </div>
    </div>
  );
}
