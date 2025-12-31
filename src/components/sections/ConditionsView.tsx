// Conditions View Component
// Displays Kubernetes resource conditions in a clean, compact format

import { XCircle, AlertCircle } from 'lucide-react';

// Generic condition interface that matches both V1Condition and custom condition formats
export interface ConditionItem {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  description?: string;
  lastTransitionTime?: string | Date;
}

// Condition types where True means negative/problem (inverted logic)
const INVERTED_CONDITION_TYPES = new Set([
  // Node conditions
  'MemoryPressure',
  'DiskPressure', 
  'PIDPressure',
  'NetworkUnavailable',
  // Job conditions
  'Failed',
  // ApplicationSet conditions
  'ErrorOccurred',
]);

// Format condition type by adding spaces before capital letters
// e.g., "PodReadyToStartContainers" -> "Pod Ready To Start Containers"
function formatConditionType(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

interface ConditionsViewProps {
  conditions: ConditionItem[];
}

export function ConditionsView({ conditions }: ConditionsViewProps) {
  if (!conditions || conditions.length === 0) {
    return null;
  }

  // Determine if a condition is positive based on status and whether it's inverted
  const isPositive = (condition: ConditionItem): boolean => {
    const isInverted = INVERTED_CONDITION_TYPES.has(condition.type);
    const statusTrue = condition.status === 'True';
    return isInverted ? !statusTrue : statusTrue;
  };

  // Filter to show only conditions that are not good (negative or unknown)
  const filteredConditions = conditions.filter(condition => !isPositive(condition));

  // If all conditions are good, don't render anything
  if (filteredConditions.length === 0) {
    return null;
  }

  // Sort: negative conditions first, then unknown
  const sortedConditions = [...filteredConditions].sort((a, b) => {
    const aUnknown = a.status === 'Unknown';
    const bUnknown = b.status === 'Unknown';
    if (aUnknown === bUnknown) return 0;
    return aUnknown ? 1 : -1;
  });

  return (
    <div>
      <h5 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
        Conditions
      </h5>
      <div className="rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700/50">
        {sortedConditions.map((condition, index) => {
        const isUnknown = condition.status === 'Unknown';

        // Determine styling based on condition state
        let bgClass: string;
        let iconBgClass: string;
        let Icon: typeof XCircle;
        let iconColor: string;
        let typeColor: string;

        if (isUnknown) {
          bgClass = 'bg-amber-50/50 dark:bg-amber-500/5';
          iconBgClass = 'bg-amber-100 dark:bg-amber-500/20';
          Icon = AlertCircle;
          iconColor = 'text-amber-500 dark:text-amber-400';
          typeColor = 'text-amber-700 dark:text-amber-400';
        } else {
          bgClass = 'bg-red-50/50 dark:bg-red-500/5';
          iconBgClass = 'bg-red-100 dark:bg-red-500/20';
          Icon = XCircle;
          iconColor = 'text-red-500 dark:text-red-400';
          typeColor = 'text-red-700 dark:text-red-400';
        }

        return (
          <div
            key={`${condition.type}-${index}`}
            className={`${bgClass} ${index > 0 ? 'border-t border-neutral-200 dark:border-neutral-700/50' : ''}`}
          >
            <div className="flex items-center gap-3 px-3 py-2">
              {/* Icon */}
              <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${iconBgClass}`}>
                <Icon size={14} className={iconColor} />
              </div>

              {/* Type as title */}
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${typeColor}`}>
                  {formatConditionType(condition.type)}
                </span>
                {/* Human-friendly description */}
                {condition.description && (
                  <div className="text-xs text-neutral-500 dark:text-neutral-500">
                    {condition.description}
                  </div>
                )}
              </div>
            </div>

            {/* Message - always shown */}
            {condition.message && (
              <div className="px-3 pb-2 pl-12">
                <div className="text-xs text-neutral-500 dark:text-neutral-500 wrap-break-word">
                  {condition.message}
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
