import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSystemStatus, startSystem, stopSystem, type SystemStatus } from '../api/docker/docker';

export type SystemAction = 'start' | 'stop';

export interface ContextSystemState {
  status?: SystemStatus;
  error: Error | null;
  /** Start / stop in progress, from this UI or reported by the CLI */
  transition: SystemAction | null;
  actionError: string | null;
  runAction: (action: SystemAction) => Promise<void>;
  clearActionError: () => void;
}

function reportedTransition(status?: SystemStatus): SystemAction | null {
  if (status?.status === 'starting') return 'start';
  if (status?.status === 'stopping') return 'stop';
  return null;
}

// Status of the service behind a context (Apple container, Docker Desktop),
// shared by the sidebar footer and the stopped screen so both reflect a
// pending start / stop.
export function useContextSystem(context: string, enabled: boolean): ContextSystemState {
  const queryClient = useQueryClient();

  // Scoped to the context they belong to: the layout stays mounted when
  // switching contexts
  const [pending, setPending] = useState<{ context: string; action: SystemAction } | null>(null);
  const [failure, setFailure] = useState<{ context: string; message: string } | null>(null);

  const pendingAction = pending?.context === context ? pending.action : null;
  const actionError = failure?.context === context ? failure.message : null;

  const { data: status, error } = useQuery({
    queryKey: ['docker', context, 'system'],
    queryFn: () => getSystemStatus(context),
    // poll faster while a start / stop triggered elsewhere is in progress
    refetchInterval: (query) => (reportedTransition(query.state.data) ? 1500 : 5000),
    enabled,
  });

  const runAction = async (action: SystemAction) => {
    setFailure(null);
    setPending({ context, action });

    try {
      await (action === 'start' ? startSystem(context) : stopSystem(context));
    } catch (err) {
      setFailure({ context, message: err instanceof Error ? err.message : `Failed to ${action}` });
    } finally {
      // Refresh the status and every resource list of this context
      await queryClient.invalidateQueries({ queryKey: ['docker', context] });
      setPending(null);
    }
  };

  return {
    status,
    error,
    // a failed check must not keep showing the last reported transition
    transition: pendingAction ?? (error ? null : reportedTransition(status)),
    actionError,
    runAction,
    clearActionError: () => setFailure(null),
  };
}

// Whether the main area should show the stopped screen instead of resources
export function isContextSystemStopped(system: ContextSystemState): boolean {
  return system.transition === 'stop' || (!!system.status && !system.status.running);
}
