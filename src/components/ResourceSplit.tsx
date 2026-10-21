import { useSyncExternalStore, type ReactNode } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';

const compactQuery = '(max-width: 1023px)';
function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(compactQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function ResourceSplit({
  children,
  details,
  isChatPanelOpen = false,
  overview = false,
}: {
  children: ReactNode;
  details?: ReactNode;
  isChatPanelOpen?: boolean;
  overview?: boolean;
}) {
  const compact = useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(compactQuery).matches,
    () => false,
  );
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `bridge-resource-split${isChatPanelOpen ? '-with-assistant' : ''}`,
    panelIds: details ? ['list', 'details'] : ['list'],
    onlySaveAfterUserInteractions: true,
  });

  return (
    <Group
      className="resource-split h-full min-w-0 flex-1"
      orientation="horizontal"
      disabled={compact}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      data-compact={compact}
      data-details-open={!!details}
      data-chat-open={isChatPanelOpen}
      data-chat-narrow={!!details && !overview}
    >
      <Panel id="list" minSize={compact ? 0 : 240} className="h-full min-w-0">
        {children}
      </Panel>
      {details && (
        <>
          <Separator
            aria-label="Resize resource details"
            title="Drag to resize · Double-click to reset"
            className="resource-separator group relative z-20 w-1 bg-neutral-200 outline-none transition-colors hover:bg-blue-400 focus-visible:bg-blue-500 dark:bg-neutral-800 dark:hover:bg-blue-500"
          >
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-400 group-hover:bg-blue-600 group-focus-visible:bg-blue-600 dark:bg-neutral-600"
            />
          </Separator>
          <Panel
            id="details"
            data-detail-pane
            defaultSize="40rem"
            minSize={compact ? 0 : 384}
            groupResizeBehavior="preserve-pixel-size"
            className="h-full min-w-0"
          >
            {details}
          </Panel>
        </>
      )}
    </Group>
  );
}
