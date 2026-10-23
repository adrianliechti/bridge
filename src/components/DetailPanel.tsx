import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';

export interface DetailTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export function DetailPanel<T extends string>({
  name,
  kind,
  context,
  scope,
  onClose,
  tabs,
  activeTab,
  onTabChange,
  actions,
  toolbar,
  children,
}: {
  name: string;
  kind: string;
  context: string;
  scope?: string;
  onClose: () => void;
  tabs: DetailTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tabsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTab]);

  return (
    <aside
      className="resource-detail-panel flex h-full min-w-0 flex-col bg-bg"
      aria-labelledby={`${id}-title`}
    >
      <header className="window-drag flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-fg-dim">
            <span
              className="max-w-full shrink-0 truncate rounded-md bg-bg-elevated px-1.5 py-0.5 font-medium text-fg-muted"
              title={kind}
            >
              {kind}
            </span>
            <span className="min-w-0 truncate" title={context}>
              {context}
            </span>
            {scope && (
              <>
                <span aria-hidden="true" className="shrink-0">
                  /
                </span>
                <span className="min-w-0 truncate" title={scope}>
                  {scope}
                </span>
              </>
            )}
          </div>
          <h2
            id={`${id}-title`}
            title={name}
            className="truncate text-base font-semibold leading-snug text-fg"
          >
            {name}
          </h2>
        </div>
        <div className="window-no-drag flex shrink-0 items-center gap-1">
          <div className="mr-1 flex items-center gap-1 border-r border-border-subtle pr-2 empty:hidden">
            {actions}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="panel-icon-button"
          >
            <X size={18} />
          </button>
        </div>
      </header>
      {/* The active tab's controls share the tab bar instead of taking a row of their own. */}
      <div className="@container flex shrink-0 items-center border-b border-border-subtle">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Resource details"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-3"
          onKeyDown={(event) => {
            const index = tabs.findIndex((tab) => tab.id === activeTab);
            let next: number;
            switch (event.key) {
              case 'ArrowRight':
                next = (index + 1) % tabs.length;
                break;
              case 'ArrowLeft':
                next = (index - 1 + tabs.length) % tabs.length;
                break;
              case 'Home':
                next = 0;
                break;
              case 'End':
                next = tabs.length - 1;
                break;
              default:
                return;
            }
            event.preventDefault();
            tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
            onTabChange(tabs[next].id);
          }}
        >
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              role="tab"
              id={`${id}-${tab.id}`}
              aria-controls={`${id}-content`}
              aria-label={tab.label}
              title={tab.count ? `${tab.label} (${tab.count})` : tab.label}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-focus ${activeTab === tab.id ? 'border-fg text-fg' : 'border-transparent text-fg-dim hover:text-fg'}`}
            >
              <tab.icon size={16} aria-hidden="true" className="shrink-0 @xl:hidden" />
              <span className="hidden @xl:inline">{tab.label}</span>
              {!!tab.count && (
                <span
                  aria-hidden="true"
                  className="hidden @xl:inline rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-fg-muted"
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {toolbar && <div className="flex shrink-0 items-center gap-1 pl-2 pr-3">{toolbar}</div>}
      </div>
      <div
        id={`${id}-content`}
        role="tabpanel"
        aria-labelledby={`${id}-${activeTab}`}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {children}
      </div>
    </aside>
  );
}
