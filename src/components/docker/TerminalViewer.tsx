import { useCallback } from 'react';
import { ShellSession } from '../../api/docker/dockerExec';
import { formatContainerName, type DockerContainer } from '../../api/docker/docker';
import { TerminalView, type TerminalCallbacks } from '../TerminalView';

export interface DockerTerminalViewerProps {
  context: string;
  container: DockerContainer;
}

export function DockerTerminalViewer({ context, container }: DockerTerminalViewerProps) {
  const containerId = container.Id ?? '';
  const createSession = useCallback(
    (callbacks: TerminalCallbacks) =>
      new ShellSession({ context, container: containerId, ...callbacks }),
    [context, containerId],
  );

  if (!containerId) {
    return (
      <div className="p-4 text-sm text-neutral-500">No container available for a terminal.</div>
    );
  }

  return (
    <TerminalView
      key={`${context}/${containerId}`}
      label={formatContainerName(container.Names ?? [])}
      createSession={createSession}
    />
  );
}
