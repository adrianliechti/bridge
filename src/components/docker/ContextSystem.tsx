import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Container, Loader2, Play, Square, X } from 'lucide-react';
import type { ContextSystem } from '../../config';
import type { ContextSystemState } from '../../hooks/useContextSystem';

const systemNames: Record<ContextSystem, string> = {
  container: 'Container system',
  'docker-desktop': 'Docker Desktop',
};

interface ContextSystemProps {
  kind: ContextSystem;
  system: ContextSystemState;
}

// Sidebar footer: shows whether the service is running and starts / stops it.
export function SystemFooter({ kind, system }: ContextSystemProps) {
  const { status, error, transition, actionError, runAction, clearActionError } = system;

  const [confirmStop, setConfirmStop] = useState(false);

  const name = systemNames[kind];
  const running = status?.running ?? false;

  const label =
    transition === 'start'
      ? 'Starting…'
      : transition === 'stop'
        ? 'Stopping…'
        : status
          ? `${name} ${running ? 'running' : 'stopped'}`
          : error
            ? `${name} unavailable`
            : 'Checking…';

  return (
    <div className="shrink-0 px-2 py-2 border-t border-neutral-200/70 dark:border-neutral-800">
      <div className="flex items-center gap-2 pl-3 text-xs text-neutral-500 dark:text-neutral-400">
        <span
          className="flex-1 truncate"
          title={status?.version ? `${name} ${status.version}` : name}
        >
          {label}
        </span>
        {status && (
          <button
            type="button"
            onClick={() => (running ? setConfirmStop(true) : void runAction('start'))}
            disabled={transition !== null}
            title={running ? `Stop ${name}` : `Start ${name}`}
            aria-label={running ? `Stop ${name}` : `Start ${name}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            {transition ? (
              <Loader2 size={14} className="animate-spin" />
            ) : running ? (
              <Square size={14} />
            ) : (
              <Play size={14} />
            )}
          </button>
        )}
      </div>

      {/* A failed start is shown on the stopped screen instead */}
      {actionError && running && (
        <div
          role="alert"
          className="mt-1 flex items-start gap-1 pl-3 text-xs text-red-600 dark:text-red-400"
        >
          <span className="flex-1 min-w-0 break-words line-clamp-4" title={actionError}>
            {actionError}
          </span>
          <button
            type="button"
            onClick={clearActionError}
            className="shrink-0 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Portal: the sidebar's backdrop blur would otherwise contain the overlay */}
      {confirmStop &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                Stop {name}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
                All running containers will be stopped. Containers, images and volumes are kept.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmStop(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setConfirmStop(false);
                    void runAction('stop');
                  }}
                  className="px-4 py-2 text-sm font-medium rounded transition-colors bg-red-600 hover:bg-red-700 text-white"
                >
                  Stop
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// Main area while the service is stopped, starting or stopping, in place of
// the resource list that would only show connection errors.
export function SystemStopped({ kind, system }: ContextSystemProps) {
  const { transition, actionError, runAction } = system;

  const name = systemNames[kind];

  return (
    <main className="flex-1 flex flex-col h-full min-w-0 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {transition ? <Loader2 size={22} className="animate-spin" /> : <Container size={22} />}
        </div>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {transition === 'start'
            ? `Starting ${name}…`
            : transition === 'stop'
              ? `Stopping ${name}…`
              : `${name} is stopped`}
        </h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {transition
            ? 'This can take a moment.'
            : 'Start it to see and manage containers, images, volumes and networks.'}
        </p>
        {!transition && (
          <button
            type="button"
            onClick={() => void runAction('start')}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
          >
            <Play size={14} />
            Start
          </button>
        )}
        {actionError && (
          <p role="alert" className="mt-4 text-xs text-red-600 dark:text-red-400 break-words">
            {actionError}
          </p>
        )}
      </div>
    </main>
  );
}
