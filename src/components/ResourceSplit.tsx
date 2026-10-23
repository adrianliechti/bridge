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
      data-overview={overview}
    >
      <Panel id="list" minSize={compact ? 0 : 240} className="h-full min-w-0">
        {children}
      </Panel>
      {details && (
        <>
          <Separator
            aria-label="Resize resource details"
            title="Drag to resize · Double-click to reset"
            className="resource-separator relative z-20 w-px bg-border-subtle outline-none transition-colors hover:bg-border-strong focus-visible:bg-focus"
          >
            {/* A hairline that is still easy to grab. */}
            <span aria-hidden="true" className="absolute inset-y-0 -left-1.5 -right-1.5" />
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
