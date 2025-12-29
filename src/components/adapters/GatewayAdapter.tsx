/* eslint-disable react-refresh/only-export-components */
// Gateway Adapter
// Extracts display data from Gateway API Gateway resources

import React from 'react';
import { Radio, Globe } from 'lucide-react';
import type { ResourceAdapter, ResourceSections } from './types';

interface Listener {
  name: string;
  hostname?: string;
  port: number;
  protocol: string;
}

interface Gateway {
  spec?: {
    gatewayClassName: string;
    listeners: Listener[];
  };
  status?: {
    addresses?: Array<{
      type?: string;
      value: string;
    }>;
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
    listeners?: Array<{
      name: string;
      attachedRoutes: number;
    }>;
  };
}

export const GatewayAdapter: ResourceAdapter<Gateway> = {
  kinds: ['Gateway', 'Gateways'],

  adapt(_context: string, resource): ResourceSections {
    const spec = resource.spec;
    const status = resource.status;

    if (!spec) {
      return { sections: [] };
    }

    const acceptedCondition = status?.conditions?.find((c) => c.type === 'Accepted');
    const programmedCondition = status?.conditions?.find((c) => c.type === 'Programmed');

    const isAccepted = acceptedCondition?.status === 'True';
    const isProgrammed = programmedCondition?.status === 'True';

    const totalAttachedRoutes =
      status?.listeners?.reduce((sum, l) => sum + (l.attachedRoutes || 0), 0) || 0;

    return {
      sections: [
        {
          id: 'status',
          title: 'Gateway Status',
          data: {
            type: 'status-cards',
            items: [
              {
                label: 'Gateway Class',
                value: spec.gatewayClassName,
                status: 'neutral' as const,
              },
              {
                label: 'Accepted',
                value: isAccepted ? 'Yes' : 'No',
                status: isAccepted ? ('success' as const) : ('error' as const),
              },
              {
                label: 'Programmed',
                value: isProgrammed ? 'Yes' : 'No',
                status: isProgrammed ? ('success' as const) : ('error' as const),
              },
              {
                label: 'Attached Routes',
                value: totalAttachedRoutes,
                status: 'neutral' as const,
              },
            ],
          },
        },

        ...(status?.addresses && status.addresses.length > 0
          ? [
              {
                id: 'addresses',
                title: 'Addresses',
                data: {
                  type: 'info-grid' as const,
                  items: status.addresses.map((addr) => ({
                    label: addr.type || 'IPAddress',
                    value: addr.value,
                    color: 'text-blue-400',
                  })),
                  columns: 2 as const,
                },
              },
            ]
          : []),

        {
          id: 'listeners',
          title: 'Listeners',
          data: {
            type: 'custom' as const,
            render: () => (
              <div className="space-y-2">
                {spec.listeners.map((listener) => (
                  <ListenerCard key={listener.name} listener={listener} status={status} />
                ))}
              </div>
            ),
          },
        },

        ...((status?.conditions ?? []).length > 0
          ? [
              {
                id: 'conditions',
                data: {
                  type: 'conditions' as const,
                  items: (status?.conditions ?? []).map((c) => ({
                    type: c.type || '',
                    status: c.status || '',
                    reason: c.reason,
                    message: c.message,
                  })),
                },
              },
            ]
          : []),
      ],
    };
  },
};

// Listener Card Component
function ListenerCard({ 
  listener, 
  status 
}: { 
  listener: Listener; 
  status?: Gateway['status'];
}) {
  const [expanded, setExpanded] = React.useState(false);
  
  const listenerStatus = status?.listeners?.find((l) => l.name === listener.name);
  const attachedRoutes = listenerStatus?.attachedRoutes ?? 0;
  
  return (
    <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-neutral-200/50 dark:hover:bg-neutral-800/30 transition-colors cursor-pointer"
      >
        <Radio size={14} className="text-emerald-400" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {listener.name}
            </span>
            <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
              {listener.protocol}
            </span>
          </div>
          <div className="text-xs text-neutral-500">
            Port {listener.port} • {attachedRoutes} route{attachedRoutes !== 1 ? 's' : ''}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Protocol & Port</div>
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-neutral-500 dark:text-neutral-400">Protocol:</span>
                <span className="text-blue-400">{listener.protocol}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-neutral-500 dark:text-neutral-400">Port:</span>
                <span className="text-cyan-400">{listener.port}</span>
              </div>
            </div>
          </div>

          {listener.hostname && (
            <div>
              <div className="text-xs text-neutral-500 mb-1">Hostname</div>
              <div className="text-xs bg-neutral-100 dark:bg-neutral-900/50 rounded p-2">
                <div className="flex items-center gap-2">
                  <Globe size={10} className="text-cyan-400" />
                  <span className="text-cyan-400">{listener.hostname}</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-neutral-500 mb-1">Attached Routes</div>
            <div className="text-xs">
              <span className="text-emerald-400 font-medium">{attachedRoutes}</span>
              <span className="text-neutral-500 ml-1">route{attachedRoutes !== 1 ? 's' : ''} attached</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
