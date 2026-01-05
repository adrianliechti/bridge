// Action Helper Functions
// Creates common action configurations to reduce boilerplate in adapters

import { createElement } from 'react';
import { Trash2, RefreshCw, ArrowUpDown } from 'lucide-react';
import type { ResourceAction, ActionInput } from './types';

/**
 * Create a delete action with confirmation dialog
 */
export function createDeleteAction<T>(
  execute: (context: string, resource: T) => Promise<void>,
  options?: {
    message?: string;
    isDisabled?: (resource: T) => string | false;
    isVisible?: (resource: T) => boolean;
  }
): ResourceAction<T> {
  return {
    id: 'delete',
    label: 'Delete',
    icon: createElement(Trash2, { size: 14 }),
    variant: 'danger',
    confirm: {
      title: 'Delete Resource',
      message: options?.message || 'Are you sure you want to delete this resource? This action cannot be undone.',
      confirmLabel: 'Delete',
    },
    execute,
    isDisabled: options?.isDisabled,
    isVisible: options?.isVisible,
  };
}

/**
 * Create a scale action with compact slider UI
 */
export function createScaleAction<T>(
  execute: (context: string, resource: T, replicas: number) => Promise<void>,
  getReplicas: (resource: T) => number,
  options?: {
    title?: string;
    description?: string;
    max?: number;
    isDisabled?: (resource: T) => string | false;
  }
): ResourceAction<T> {
  return {
    id: 'scale',
    label: 'Scale',
    icon: createElement(ArrowUpDown, { size: 14 }),
    variant: 'primary',
    input: {
      title: options?.title || 'Scale',
      description: options?.description,
      submitLabel: 'Apply',
      label: 'Replicas',
      type: 'slider',
      min: 0,
      max: options?.max ?? 20,
      defaultValue: (res) => getReplicas(res as T),
    } satisfies ActionInput,
    execute: async (context, resource, inputValues) => {
      const replicasRaw = inputValues?.value;
      const replicas = typeof replicasRaw === 'number' ? replicasRaw : Number(replicasRaw);
      if (!Number.isFinite(replicas) || replicas < 0) {
        throw new Error('Replicas must be a non-negative number');
      }
      await execute(context, resource, replicas);
    },
    isDisabled: options?.isDisabled,
  };
}

/**
 * Create a restart action (rolling restart for workloads)
 */
export function createRestartAction<T>(
  execute: (context: string, resource: T) => Promise<void>,
  options?: {
    isDisabled?: (resource: T) => string | false;
  }
): ResourceAction<T> {
  return {
    id: 'restart',
    label: 'Restart',
    icon: createElement(RefreshCw, { size: 14 }),
    variant: 'secondary',
    execute,
    isDisabled: options?.isDisabled,
  };
}
