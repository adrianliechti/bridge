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
      className="resource-detail-panel flex h-full min-w-0 flex-col bg-white dark:bg-neutral-900"
      aria-labelledby={`${id}-title`}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
            <span
              className="max-w-full shrink-0 truncate rounded-md bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
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
            className="truncate text-base font-semibold leading-snug text-neutral-900 dark:text-neutral-100"
          >
            {name}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="mr-1 flex items-center gap-1 border-r border-neutral-200 pr-2 empty:hidden dark:border-neutral-800">
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
      <div className="@container shrink-0">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Resource details"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-200 px-3 dark:border-neutral-800"
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
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-500 ${activeTab === tab.id ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'}`}
            >
              <tab.icon size={16} aria-hidden="true" className="shrink-0 @xl:hidden" />
              <span className="hidden @xl:inline">{tab.label}</span>
              {!!tab.count && (
                <span
                  aria-hidden="true"
                  className="hidden @xl:inline rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="detail-toolbar shrink-0 flex-wrap items-center justify-end gap-1 border-b border-neutral-200 bg-neutral-50 px-4 py-1.5 dark:border-neutral-800 dark:bg-neutral-950/30">
        {toolbar}
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
