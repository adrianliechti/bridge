import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, RefreshCw } from 'lucide-react';
import {
  inspectContainer,
  type DockerContainer,
  type ContainerInspect,
  formatContainerName,
  getContainerStateColor,
} from '../../api/docker/docker';
import { ResourceVisualizer } from './ResourceVisualizer';
import { hasAdapter, getResourceActions } from './index';
import { LogViewer } from './LogViewer';
import type { ResourceAction } from './adapters/types';

interface ResourcePanelProps {
  isOpen: boolean;
  onClose: () => void;
  otherPanelOpen?: boolean;
  resource: DockerContainer | null;
}

export function ResourcePanel({ isOpen, onClose, otherPanelOpen = false, resource }: ResourcePanelProps) {
  const [fullObject, setFullObject] = useState<ContainerInspect | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs'>('overview');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ResourceAction | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Auto-refresh interval (5 seconds)
  const REFRESH_INTERVAL = 5000;

  const containerId = resource?.Id ?? '';
  const containerName = resource ? formatContainerName(resource.Names ?? []) : '';

  const fetchResourceData = useCallback(async () => {
    if (!containerId) return;
    
    try {
      const data = await inspectContainer(containerId);
      setFullObject(data);
    } catch {
      // Silent fail for background refreshes
    }
  }, [containerId]);

  // Auto-refresh polling
  useEffect(() => {
    if (!isOpen || !containerId || !fullObject) return;

    const interval = setInterval(() => {
      fetchResourceData();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [isOpen, containerId, fullObject, fetchResourceData]);

  // Fetch the resource when container changes
  useEffect(() => {
    setActiveTab('overview');
    
    if (!containerId) {
      setFullObject(null);
      setError(null);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const data = await inspectContainer(containerId);
        setFullObject(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch container details');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [containerId]);

  // Get actions for the resource
  const resourceActions = fullObject ? getResourceActions(fullObject).filter(action => {
    // Filter by visibility
    if (action.isVisible && !action.isVisible(fullObject)) return false;
    return true;
  }) : [];

  // Handle action click
  const handleActionClick = async (action: ResourceAction) => {
    if (action.confirm) {
      setConfirmAction(action);
      return;
    }
    await executeAction(action);
  };

  // Execute action
  const executeAction = async (action: ResourceAction) => {
    if (!fullObject) return;
    
    setLoadingAction(action.id);
    setConfirmAction(null);
    
    try {
      await action.execute('', fullObject); // Docker doesn't use context
      await fetchResourceData();
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setLoadingAction(null);
    }
  };

  if (!isOpen) return null;

  const tabs: { id: 'overview' | 'logs'; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Logs' },
  ];

  // Only show overview tab if we have an adapter
  const showOverviewTab = hasAdapter('container');

  return (
    <div 
      className={`fixed right-0 top-0 h-full bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-700 shadow-xl z-30 flex flex-col transition-all duration-300 ${
        otherPanelOpen ? 'w-[28rem]' : 'w-[36rem]'
      }`}
    >
      {/* Header */}
      <div className="shrink-0 h-14 flex items-center justify-between px-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
              {containerName || 'Container'}
            </h2>
            {resource && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs font-medium ${getContainerStateColor(resource.State ?? '')}`}>
                  {resource.State ?? 'unknown'}
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  {containerId.substring(0, 12)}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchResourceData()}
            className="p-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-neutral-200 dark:border-neutral-800 flex items-center">
        <div className="flex">
          {tabs.filter(tab => tab.id !== 'overview' || showOverviewTab).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-neutral-900 dark:text-neutral-100 border-b-2 border-neutral-900 dark:border-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Tab-specific action buttons */}
        <div className="ml-auto pr-4 flex items-center gap-1">
          {/* Portal target for child component toolbar actions */}
          <div ref={toolbarRef} className="flex items-center gap-1" />
          {activeTab === 'overview' && resourceActions.map(action => {
            const disabled = action.isDisabled?.(fullObject!);
            const isDisabled = disabled === true || typeof disabled === 'string';
            const disabledReason = typeof disabled === 'string' ? disabled : undefined;
            const isLoading = loadingAction === action.id;

            return (
              <button
                key={action.id}
                onClick={() => handleActionClick(action)}
                disabled={isDisabled || isLoading}
                title={disabledReason || action.label}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors
                  ${isDisabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                  ${action.variant === 'primary' 
                    ? 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-neutral-200 dark:hover:bg-neutral-800' 
                    : action.variant === 'warning'
                    ? 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                    : action.variant === 'danger'
                    ? 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                  }
                `}
              >
                {isLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  action.icon
                )}
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {confirmAction.confirm?.title}
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
              {confirmAction.confirm?.message}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeAction(confirmAction)}
                className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                  confirmAction.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : confirmAction.variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {confirmAction.confirm?.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading && !fullObject ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 text-red-500 text-sm">{error}</div>
        ) : !resource ? (
          <div className="p-4 text-neutral-500 text-sm">No container selected</div>
        ) : (
          <>
            {activeTab === 'overview' && fullObject && (
              <div className="h-full overflow-auto p-4">
                <ResourceVisualizer
                  resource={fullObject}
                  onActionComplete={fetchResourceData}
                  hideActions={true}
                />
              </div>
            )}
            {activeTab === 'logs' && resource && (
              <LogViewer container={resource} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
