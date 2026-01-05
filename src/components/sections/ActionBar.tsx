import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ResourceAction } from './types';

export interface ActionBarProps<T> {
  context: string;
  actions: ResourceAction<T>[];
  resource: T;
  onActionComplete?: () => void;
}

export function ActionBar<T>({ context, actions, resource, onActionComplete }: ActionBarProps<T>) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ResourceAction<T> | null>(null);
  const [inputAction, setInputAction] = useState<ResourceAction<T> | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string | number>>({});
  const [error, setError] = useState<string | null>(null);

  if (actions.length === 0) return null;

  const executeAction = async (action: ResourceAction<T>, values?: Record<string, string | number>) => {
    setError(null);
    setLoadingAction(action.id);
    try {
      await action.execute(context, resource, values);
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoadingAction(null);
      setConfirmAction(null);
      setInputAction(null);
      setInputValues({});
    }
  };

  const handleActionClick = (action: ResourceAction<T>) => {
    if (action.input) {
      // Initialize input value with default
      const defaultValue = action.input.defaultValue
        ? action.input.defaultValue(resource)
        : action.input.type === 'number' ? 0 : '';
      setInputValues({ value: defaultValue });
      setInputAction(action);
    } else if (action.confirm) {
      setConfirmAction(action);
    } else {
      executeAction(action);
    }
  };

  const getVariantClasses = (variant: ResourceAction<T>['variant'] = 'secondary') => {
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

      {/* Input Dialog */}
      {inputAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 max-w-md mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-neutral-200 mb-2">
              {inputAction.input?.title}
            </h3>
            {inputAction.input?.description && (
              <p className="text-xs text-neutral-400 mb-4">
                {inputAction.input.description}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeAction(inputAction, inputValues);
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs text-neutral-400 mb-1">
                  {inputAction.input?.label}
                </label>
                <input
                  type={inputAction.input?.type}
                  value={inputValues.value ?? ''}
                  onChange={(e) => {
                    const value = inputAction.input?.type === 'number' 
                      ? parseInt(e.target.value, 10) || 0
                      : e.target.value;
                    setInputValues({ value });
                  }}
                  min={inputAction.input?.min}
                  max={inputAction.input?.max}
                  placeholder={inputAction.input?.placeholder}
                  className="w-full px-3 py-2 text-sm bg-neutral-900 border border-neutral-600 rounded text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setInputAction(null);
                    setInputValues({});
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded border border-neutral-600 bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loadingAction === inputAction.id}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border
                    ${getVariantClasses(inputAction.variant)}
                    ${loadingAction === inputAction.id ? 'opacity-75' : ''}
                  `}
                >
                  {loadingAction === inputAction.id && (
                    <RefreshCw size={14} className="animate-spin" />
                  )}
                  {inputAction.input?.submitLabel || 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
