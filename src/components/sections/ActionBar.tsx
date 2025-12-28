import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ResourceAction } from '../adapters/types';
import type { KubernetesResource } from '../../api/kubernetes';
import { useCluster } from '../../hooks/useCluster';

export interface ActionBarProps {
  actions: ResourceAction[];
  resource: KubernetesResource;
  onActionComplete?: () => void;
}

export function ActionBar({ actions, resource, onActionComplete }: ActionBarProps) {
  const { context } = useCluster();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ResourceAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (actions.length === 0) return null;

  const executeAction = async (action: ResourceAction) => {
    setError(null);
    setLoadingAction(action.id);
    try {
      await action.execute(context, resource);
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoadingAction(null);
      setConfirmAction(null);
    }
  };

  const handleActionClick = (action: ResourceAction) => {
    if (action.confirm) {
      setConfirmAction(action);
    } else {
      executeAction(action);
    }
  };

  const getVariantClasses = (variant: ResourceAction['variant'] = 'secondary') => {
    switch (variant) {
      case 'primary':
        return 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600';
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 text-white border-red-600';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600';
      default:
        return 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200 border-neutral-600';
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        {actions.map(action => {
          const disabled = action.isDisabled?.(resource);
          const isDisabled = disabled === true || typeof disabled === 'string';
          const disabledReason = typeof disabled === 'string' ? disabled : undefined;
          const isLoading = loadingAction === action.id;

          return (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              disabled={isDisabled || isLoading}
              title={disabledReason}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border
                transition-colors duration-150
                ${getVariantClasses(action.variant)}
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${isLoading ? 'opacity-75' : ''}
              `}
            >
              {isLoading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                action.icon
              )}
              {action.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 max-w-md mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-neutral-200 mb-2">
              {confirmAction.confirm?.title}
            </h3>
            <p className="text-xs text-neutral-400 mb-4">
              {confirmAction.confirm?.message}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 text-xs font-medium rounded border border-neutral-600 bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={() => executeAction(confirmAction)}
                disabled={loadingAction === confirmAction.id}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border
                  ${getVariantClasses(confirmAction.variant)}
                  ${loadingAction === confirmAction.id ? 'opacity-75' : ''}
                `}
              >
                {loadingAction === confirmAction.id && (
                  <RefreshCw size={14} className="animate-spin" />
                )}
                {confirmAction.confirm?.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
