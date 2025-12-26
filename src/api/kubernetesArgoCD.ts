// ArgoCD Application API operations

import { fetchApi } from './kubernetes';

const ARGOCD_API = '/apis/argoproj.io/v1alpha1';

export interface SyncOptions {
  prune?: boolean;
  dryRun?: boolean;
  revision?: string;
  strategy?: 'hook' | 'apply';
}

export interface ApplicationStatus {
  sync: { status: string; revision?: string };
  health: { status: string; message?: string };
  operationState?: {
    phase: string;
    message?: string;
    startedAt?: string;
    finishedAt?: string;
  };
}

async function patchApplication(
  name: string,
  namespace: string,
  patch: object
): Promise<Response> {
  const url = `${ARGOCD_API}/namespaces/${namespace}/applications/${name}`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to patch application: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response;
}

export async function syncApplication(
  name: string,
  namespace: string = 'argocd',
  options: SyncOptions = {}
): Promise<void> {
  const syncStrategy = options.strategy === 'apply' ? { apply: {} } : { hook: {} };

  const patch: Record<string, unknown> = {
    operation: {
      sync: {
        syncStrategy,
        ...(options.revision && { revision: options.revision }),
        ...(options.prune !== undefined && { prune: options.prune }),
        ...(options.dryRun !== undefined && { dryRun: options.dryRun }),
      },
    },
  };

  await patchApplication(name, namespace, patch);
}

export async function getApplicationStatus(
  name: string,
  namespace: string = 'argocd'
): Promise<ApplicationStatus> {
  const url = `${ARGOCD_API}/namespaces/${namespace}/applications/${name}`;
  const app = await fetchApi<{
    status?: {
      sync?: { status?: string; revision?: string };
      health?: { status?: string; message?: string };
      operationState?: {
        phase?: string;
        message?: string;
        startedAt?: string;
        finishedAt?: string;
      };
    };
  }>(url);

  return {
    sync: {
      status: app.status?.sync?.status || 'Unknown',
      revision: app.status?.sync?.revision,
    },
    health: {
      status: app.status?.health?.status || 'Unknown',
      message: app.status?.health?.message,
    },
    operationState: app.status?.operationState ? {
      phase: app.status.operationState.phase || 'Unknown',
      message: app.status.operationState.message,
      startedAt: app.status.operationState.startedAt,
      finishedAt: app.status.operationState.finishedAt,
    } : undefined,
  };
}

export async function refreshApplication(
  name: string,
  namespace: string = 'argocd',
  hard: boolean = false
): Promise<void> {
  await patchApplication(name, namespace, {
    metadata: {
      annotations: { 'argocd.argoproj.io/refresh': hard ? 'hard' : 'normal' },
    },
  });
}

export async function terminateOperation(
  name: string,
  namespace: string = 'argocd'
): Promise<void> {
  await patchApplication(name, namespace, { operation: null });
}

export async function rollbackApplication(
  name: string,
  namespace: string = 'argocd',
  historyId: number
): Promise<void> {
  const url = `${ARGOCD_API}/namespaces/${namespace}/applications/${name}`;
  const app = await fetchApi<{
    status?: {
      history?: Array<{ id?: number; revision?: string }>;
    };
  }>(url);

  const historyEntry = app.status?.history?.find(h => h.id === historyId);
  if (!historyEntry?.revision) {
    throw new Error(`History entry with ID ${historyId} not found`);
  }

  await syncApplication(name, namespace, { revision: historyEntry.revision });
}
