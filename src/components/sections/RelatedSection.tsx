import { useState, useEffect } from 'react';
import { 
  Layers, 
  HardDrive, 
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { ReplicaSetData, PVCData, JobData } from './types';
import { formatTimeAgo } from './utils';

export function RelatedReplicaSetsSection({ loader, title }: { loader: () => Promise<ReplicaSetData[]>; title?: string }) {
  const [items, setItems] = useState<ReplicaSetData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loader().then(setItems).finally(() => setLoading(false));
  }, [loader]);

  if (loading) {
    return (
      <div>
        {title && <h5 className="text-xs font-medium text-neutral-600 dark:text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>}
        <div className="text-xs text-neutral-600 dark:text-neutral-500">Loading ReplicaSets...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      {title && <h5 className="text-xs font-medium text-neutral-600 dark:text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>}
      <div className="space-y-2">
        {items.map(rs => (
          <div key={rs.name} className={`border rounded-lg p-3 ${
            rs.isCurrent 
              ? 'border-blue-500/30 bg-blue-500/5' 
              : 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900/50 opacity-60'
          }`}>
            <div className="flex items-center gap-3">
              <Layers size={16} className={rs.isCurrent ? 'text-blue-400' : 'text-neutral-600 dark:text-neutral-500'} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate" title={rs.name}>
                    {rs.name}
                  </span>
                </div>
                {rs.images.length > 0 && (
                  <div className="text-xs text-neutral-600 dark:text-neutral-500 truncate">
                    {rs.images.join(', ')}
                  </div>
                )}
              </div>
              <div className="text-xs">
                <span className={rs.readyReplicas === rs.replicas ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                  {rs.readyReplicas}/{rs.replicas}
                </span>
                <span className="text-neutral-600 dark:text-neutral-500 ml-1">ready</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RelatedPVCsSection({ loader, title }: { loader: () => Promise<PVCData[]>; title?: string }) {
  const [items, setItems] = useState<PVCData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loader().then(setItems).finally(() => setLoading(false));
  }, [loader]);

  if (loading) {
    return (
      <div>
        {title && <h5 className="text-xs font-medium text-neutral-600 dark:text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>}
        <div className="text-xs text-neutral-600 dark:text-neutral-500">Loading PVCs...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      {title && <h5 className="text-xs font-medium text-neutral-600 dark:text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>}
      <div className="space-y-2">
        {items.map(pvc => (
          <div key={pvc.name} className={`border rounded-lg p-3 ${
            pvc.status === 'Bound' 
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900/50'
          }`}>
            <div className="flex items-center gap-3">
              <HardDrive size={16} className={pvc.status === 'Bound' ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-600 dark:text-neutral-500'} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{pvc.name}</span>
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-500">
                  {pvc.storageClass || 'default'} storage class
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {pvc.capacity && (
                  <span className="text-cyan-600 dark:text-cyan-400">{pvc.capacity}</span>
                )}
                <span className={pvc.status === 'Bound' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                  {pvc.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RelatedJobsSection({ loader, title }: { loader: () => Promise<JobData[]>; title?: string }) {
  const [items, setItems] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    loader().then(setItems).finally(() => setLoading(false));
  }, [loader]);

  if (loading) {
    return (
      <div>
        {title && <h5 className="text-xs font-medium text-neutral-600 dark:text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>}
        <div className="text-xs text-neutral-600 dark:text-neutral-500">Loading jobs...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  const displayJobs = expanded ? items : items.slice(0, 3);

  return (
    <div>
      {title && <h5 className="text-xs font-medium text-neutral-600 dark:text-neutral-500 uppercase tracking-wider mb-2">{title}</h5>}
      <div className="space-y-2">
        {displayJobs.map(job => (
          <div 
            key={job.name} 
            className={`border rounded-lg p-3 ${
              job.status === 'Complete' 
                ? 'border-emerald-500/30 bg-emerald-500/5' 
                : job.status === 'Failed'
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-amber-500/30 bg-amber-500/5'
            }`}
          >
            <div className="flex items-center gap-3">
              {job.status === 'Complete' ? (
                <CheckCircle2 size={16} className="text-emerald-400" />
              ) : job.status === 'Failed' ? (
                <XCircle size={16} className="text-red-400" />
              ) : (
                <Clock size={16} className="text-amber-400" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate" title={job.name}>{job.name}</span>
                </div>
                {job.startTime && (
                  <div className="text-xs text-neutral-600 dark:text-neutral-500">
                    Started {formatTimeAgo(new Date(job.startTime))}
                  </div>
                )}
              </div>
              <span className={`text-xs ${
                job.status === 'Complete' ? 'text-emerald-600 dark:text-emerald-400' :
                job.status === 'Failed' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {job.status}
              </span>
            </div>
          </div>
        ))}
        {items.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300 transition-colors mt-2"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Show less' : `Show ${items.length - 3} more`}
          </button>
        )}
      </div>
    </div>
  );
}
