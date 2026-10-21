import { LogViewer } from '../sections/LogViewer';
import { useDockerLogs } from '../../hooks/useDockerLogs';
import type { DockerContainer } from '../../api/docker/docker';

export interface DockerLogViewerProps {
  context: string;
  container: DockerContainer;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
}

// Inner component that handles log streaming - use key={`${context}/${container.Id}`} to reset state
function DockerLogViewerInner({
  context: dockerContext,
  container,
  toolbarRef,
}: DockerLogViewerProps) {
  const { logs, sources, isLoading, error, unavailableMessage, droppedLines, retry } =
    useDockerLogs({
      context: dockerContext,
      container,
    });

  return (
    <LogViewer
      logs={logs}
      sources={sources}
      isLoading={isLoading}
      error={error}
      onRetry={retry}
      droppedLines={droppedLines}
      emptyMessage={
        container.State === 'running'
          ? 'Waiting for logs...'
          : 'No logs recorded for this container.'
      }
      unavailableMessage={unavailableMessage}
      toolbarRef={toolbarRef}
    />
  );
}

// Wrapper component that uses key to reset inner state when container changes
export function DockerLogViewer({ context, container, toolbarRef }: DockerLogViewerProps) {
  return (
    <DockerLogViewerInner
      key={`${context}/${container.Id}`}
      context={context}
      container={container}
      toolbarRef={toolbarRef}
    />
  );
}
