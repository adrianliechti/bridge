// Shared components for visualizers
import { type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Box } from 'lucide-react';

// Types
export type StatusType = 'success' | 'warning' | 'error' | 'neutral';

// Status Card Component
export function StatusCard({ 
  label, 
  value, 
  status,
  icon
}: { 
  label: string; 
  value: string | number; 
  status?: StatusType;
  icon?: ReactNode;
}) {
  const statusColors = {
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    neutral: 'text-gray-100',
  };

  return (
    <div className="bg-gray-900/50 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-sm font-medium flex items-center gap-2 ${statusColors[status || 'neutral']}`}>
        {icon}
        {value}
      </div>
    </div>
  );
}

// Status Gauge Component
export function StatusGauge({ 
  label, 
  current, 
  total, 
  color 
}: { 
  label: string; 
  current: number; 
  total: number; 
  color: 'emerald' | 'blue' | 'cyan' | 'purple' | 'amber';
}) {
  const percentage = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const colorClasses: Record<string, string> = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    cyan: 'text-cyan-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
  };
  const bgClasses: Record<string, string> = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    cyan: 'bg-cyan-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
  };

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={colorClasses[color]}>{current}/{total}</span>
      </div>
      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${bgClasses[color]}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// Section Header Component
export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
      {children}
    </h5>
  );
}

// Section Component (simplified, always visible)
export function Section({ 
  title, 
  count, 
  icon,
  children 
}: { 
  title: string; 
  count?: number;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <h5 className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        {icon}
        {title} {count !== undefined && `(${count})`}
      </h5>
      {children}
    </div>
  );
}

// Generic Conditions Section (simplified, always visible)
export function ConditionsSection<T extends { type?: string; status?: string; reason?: string; message?: string }>({ 
  conditions,
  // For most resources, status === 'True' is good. For Node conditions like MemoryPressure, it's the opposite.
  isPositive = (condition: T) => condition.status === 'True'
}: { 
  conditions: T[];
  isPositive?: (condition: T) => boolean;
}) {
  return (
    <div>
      <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        Conditions ({conditions.length})
      </h5>
      <div className="space-y-1">
        {conditions.map((condition, i) => {
          const isGood = isPositive(condition);
          return (
            <div 
              key={i} 
              className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded ${
                isGood
                  ? 'bg-emerald-500/10 border border-emerald-500/20' 
                  : 'bg-gray-900/50 border border-gray-700'
              }`}
            >
              {isGood ? (
                <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-gray-300">{condition.type}</div>
                {condition.reason && (
                  <div className="text-gray-500">{condition.reason}</div>
                )}
                {condition.message && (
                  <div className="text-gray-500 text-[10px] mt-0.5 wrap-break-word">{condition.message}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Labels/Selector Display (inline badges)
export function LabelList({ labels, title = 'Labels' }: { labels: Record<string, string>; title?: string }) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return null;

  return (
    <div>
      <div className="text-xs text-gray-500 mb-2">{title}</div>
      <table className="w-full text-xs">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-b border-gray-200 dark:border-gray-700/50 last:border-0">
              <td className="py-1.5 pr-3 text-sky-600 dark:text-sky-400 align-top whitespace-nowrap">
                {key}
              </td>
              <td className="py-1.5 text-emerald-600 dark:text-emerald-400 break-all">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Container Images Display
export function ContainerImages({ containers }: { containers: Array<{ name: string; image?: string }> }) {
  if (!containers || containers.length === 0) return null;

  return (
    <div>
      <SectionHeader>Container Images</SectionHeader>
      <div className="space-y-1">
        {containers.map(container => (
          <div key={container.name} className="text-xs bg-gray-900/50 px-2 py-1.5 rounded flex items-center gap-2">
            <Box size={12} className="text-blue-400 shrink-0" />
            <span className="text-gray-300">{container.name}:</span>
            <span className="text-cyan-400 truncate">{container.image}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Replica/Pod Grid Visualization
export function PodGrid({ 
  total, 
  ready, 
  available,
  current,
  icon: Icon = Box,
  showOrdinal = false 
}: { 
  total: number; 
  ready: number; 
  available?: number;
  current?: number;
  icon?: React.ComponentType<{ size: number; className: string }>;
  showOrdinal?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: total }).map((_, i) => {
        const isReady = i < ready;
        const isAvailable = available !== undefined ? i < available : isReady;
        const isCurrent = current !== undefined ? i < current : isAvailable;
        
        return (
          <div
            key={i}
            className={`${showOrdinal ? 'w-8 h-8' : 'w-6 h-6'} rounded flex flex-col items-center justify-center ${
              isReady ? 'bg-emerald-500/20 border border-emerald-500/50' :
              isAvailable ? 'bg-cyan-500/20 border border-cyan-500/50' :
              isCurrent ? 'bg-amber-500/20 border border-amber-500/50' :
              'bg-gray-700/50 border border-gray-600'
            }`}
            title={isReady ? 'Ready' : isAvailable ? 'Available' : isCurrent ? 'Current' : 'Pending'}
          >
            <Icon size={showOrdinal ? 10 : 12} className={
              isReady ? 'text-emerald-400' :
              isAvailable ? 'text-cyan-400' :
              isCurrent ? 'text-amber-400' :
              'text-gray-500'
            } />
            {showOrdinal && (
              <span className={`text-[9px] ${
                isReady ? 'text-emerald-400' :
                isAvailable ? 'text-cyan-400' :
                isCurrent ? 'text-amber-400' :
                'text-gray-500'
              }`}>{i}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Info Row for displaying key-value pairs
export function InfoRow({ label, value, color }: { label: string; value?: string | number; color?: string }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="overflow-hidden">
      <span className="text-gray-500">{label}:</span>{' '}
      <span className={color || 'text-gray-300'}>{value}</span>
    </div>
  );
}

