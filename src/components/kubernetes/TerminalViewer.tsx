import { useCallback, useState } from 'react';
import { ExecSession } from '../../api/kubernetes/kubernetesExec';
import type { KubernetesResource } from '../../api/kubernetes/kubernetes';
import { ToolbarPortal } from '../ToolbarPortal';
import { TerminalView, type TerminalCallbacks } from '../TerminalView';

export interface TerminalViewerProps {
  context: string;
  resource: KubernetesResource;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
}

interface ContainerInfo {
  name: string;
  ready: boolean;
}

function getPodContainers(resource: KubernetesResource): ContainerInfo[] {
  const spec = resource.spec as { containers?: Array<{ name: string }> } | undefined;
  const status = resource.status as
    | { containerStatuses?: Array<{ name: string; ready: boolean }> }
    | undefined;

  return (spec?.containers ?? []).map((container) => ({
    name: container.name,
    ready: status?.containerStatuses?.find((s) => s.name === container.name)?.ready ?? false,
  }));
}

function PodTerminal({
  context,
  namespace,
  pod,
  container,
}: {
  context: string;
  namespace: string;
  pod: string;
  container: string;
}) {
  const createSession = useCallback(
    (callbacks: TerminalCallbacks) =>
      new ExecSession({ context, namespace, pod, container, ...callbacks }),
    [context, namespace, pod, container],
  );
  return <TerminalView label={`${pod}/${container}`} createSession={createSession} />;
}

function TerminalViewerInner({ context, resource, toolbarRef }: TerminalViewerProps) {
  const [requestedContainer, setRequestedContainer] = useState<string | null>(null);

  const namespace = resource.metadata?.namespace ?? '';
  const podName = resource.metadata?.name ?? '';
  const containers = getPodContainers(resource);

  const selectedContainer =
    containers.find((c) => c.name === requestedContainer)?.name ?? containers[0]?.name ?? '';

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {toolbarRef && (
        <ToolbarPortal toolbarRef={toolbarRef}>
          {containers.length > 1 && (
            <select
              aria-label="Terminal container"
              value={selectedContainer}
              onChange={(event) => setRequestedContainer(event.target.value)}
              className="max-w-48 px-2 py-1.5 text-xs rounded bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300"
            >
              {containers.map((container) => (
                <option key={container.name} value={container.name}>
                  {container.name}
                  {container.ready ? '' : ' (not ready)'}
                </option>
              ))}
            </select>
          )}
        </ToolbarPortal>
      )}

      {namespace && podName && selectedContainer ? (
        <PodTerminal
          key={selectedContainer}
          context={context}
          namespace={namespace}
          pod={podName}
          container={selectedContainer}
        />
      ) : (
        <div className="p-4 text-sm text-neutral-500">No container available for a terminal.</div>
      )}
    </div>
  );
}

export function TerminalViewer(props: TerminalViewerProps) {
  const { context, resource } = props;
  return (
    <TerminalViewerInner
      key={`${context}/${resource.metadata?.namespace ?? ''}/${resource.metadata?.name ?? ''}`}
      {...props}
    />
  );
}
