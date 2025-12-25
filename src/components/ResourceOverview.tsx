import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box,
  Rocket,
  Layers,
  Ghost,
  Database,
  Zap,
  Clock,
  Plug,
  Globe,
  HardDrive,
  Disc,
  FileText,
  KeyRound,
  Server,
  Hexagon,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  type LucideIcon,
} from 'lucide-react';
import { fetchApi } from '../api/kubernetes';

import { ResourcePanel } from './ResourcePanel';
import type { V1ObjectReference } from '@kubernetes/client-node';

// Types for Kubernetes resources
interface K8sResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid: string;
    labels?: Record<string, string>;
    ownerReferences?: Array<{
      apiVersion: string;
      kind: string;
      name: string;
      uid: string;
    }>;
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

interface K8sResourceList {
  items: K8sResource[];
}

// Resource kind to icon mapping
const kindIcons: Record<string, LucideIcon> = {
  Pod: Box,
  Deployment: Rocket,
  ReplicaSet: Layers,
  DaemonSet: Ghost,
  StatefulSet: Database,
  Job: Zap,
  CronJob: Clock,
  Service: Plug,
  Ingress: Globe,
  PersistentVolume: HardDrive,
  PersistentVolumeClaim: Disc,
  ConfigMap: FileText,
  Secret: KeyRound,
  Node: Server,
};

// Resource kind to color mapping (CSS colors for SVG)
const kindColors: Record<string, { bg: string; border: string; text: string }> = {
  Pod: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  Deployment: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  ReplicaSet: { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
  DaemonSet: { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
  StatefulSet: { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
  Job: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  CronJob: { bg: '#ffedd5', border: '#f97316', text: '#9a3412' },
  Service: { bg: '#cffafe', border: '#06b6d4', text: '#155e75' },
  Ingress: { bg: '#ccfbf1', border: '#14b8a6', text: '#115e59' },
  PersistentVolume: { bg: '#f1f5f9', border: '#64748b', text: '#334155' },
  PersistentVolumeClaim: { bg: '#f8fafc', border: '#94a3b8', text: '#475569' },
  ConfigMap: { bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
  Secret: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
};

const defaultColors = { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' };

// Common Kubernetes labels for naming and grouping
const APP_LABELS = {
  NAME: 'app.kubernetes.io/name',
  INSTANCE: 'app.kubernetes.io/instance',
  PART_OF: 'app.kubernetes.io/part-of',
  APP: 'app',
  K8S_APP: 'k8s-app',
  RELEASE: 'release',
  ARGOCD_INSTANCE: 'argocd.argoproj.io/instance',
};

function getAppName(r: K8sResource, uidToResource?: Map<string, K8sResource>): string | undefined {
  const labels = r.metadata.labels || {};
  
  // Check direct labels in priority order (aligned with getGroupLabel)
  const name = labels[APP_LABELS.PART_OF] || 
               labels[APP_LABELS.ARGOCD_INSTANCE] ||
               labels[APP_LABELS.NAME] || 
               labels[APP_LABELS.INSTANCE] || 
               labels[APP_LABELS.APP] ||
               labels[APP_LABELS.K8S_APP] ||
               labels[APP_LABELS.RELEASE];
  if (name) return name;
  
  // Traverse owner chain if uidToResource is provided
  if (uidToResource) {
    const ownerRef = r.metadata.ownerReferences?.[0];
    if (ownerRef) {
      const parent = uidToResource.get(ownerRef.uid);
      if (parent) {
        return getAppName(parent, uidToResource);
      }
    }
  }
  
  return undefined;
}

function getStatus(r: K8sResource): { status: string; color: string } {
  let status = 'Unknown';
  let color = '#9ca3af';

  if (r.kind === 'Pod') {
    const phase = (r.status as { phase?: string })?.phase || 'Unknown';
    status = phase;
    if (phase === 'Running') color = '#22c55e';
    else if (phase === 'Pending') color = '#eab308';
    else if (phase === 'Failed') color = '#ef4444';
    else if (phase === 'Succeeded') color = '#22c55e';
  } else if (r.kind === 'DaemonSet') {
    // DaemonSets use different status fields than Deployments/StatefulSets
    const desired = (r.status as { desiredNumberScheduled?: number })?.desiredNumberScheduled || 0;
    const ready = (r.status as { numberReady?: number })?.numberReady || 0;
    status = `${ready}/${desired}`;
    color = ready === desired && desired > 0 ? '#22c55e' : '#eab308';
  } else if (['Deployment', 'StatefulSet', 'ReplicaSet'].includes(r.kind)) {
    const replicas = (r.status as { replicas?: number })?.replicas || 0;
    const ready = (r.status as { readyReplicas?: number })?.readyReplicas || 0;
    status = `${ready}/${replicas}`;
    color = ready === replicas && replicas > 0 ? '#22c55e' : '#eab308';
  } else if (r.kind === 'Service') {
    status = 'Active';
    color = '#22c55e';
  } else if (r.kind === 'Job') {
    const succeeded = (r.status as { succeeded?: number })?.succeeded || 0;
    const failed = (r.status as { failed?: number })?.failed || 0;
    if (succeeded > 0) { status = 'Succeeded'; color = '#22c55e'; }
    else if (failed > 0) { status = 'Failed'; color = '#ef4444'; }
    else { status = 'Running'; color = '#eab308'; }
  } else if (r.kind === 'PersistentVolumeClaim') {
    status = (r.status as { phase?: string })?.phase || 'Unknown';
    color = status === 'Bound' ? '#22c55e' : '#eab308';
  } else if (['ConfigMap', 'Secret', 'Ingress', 'CronJob'].includes(r.kind)) {
    status = 'Active';
    color = '#22c55e';
  }

  return { status, color };
}

// Layout types
interface LayoutNode {
  uid: string;
  resource: K8sResource;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutEdge {
  from: string;
  to: string;
  type: 'owner' | 'selector' | 'service' | 'ingress';
}

interface Application {
  id: string;
  name: string;
  namespace?: string;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  x: number;
  y: number;
  width: number;
  height: number;
}

// Node dimensions
const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const NODE_GAP_X = 32;
const NODE_GAP_Y = 10;
const APP_PADDING = 12;
const APP_HEADER = 36;
const APP_GAP = 20;

interface ResourceOverviewProps {
  namespace: string;
}

export function ResourceOverview({ namespace }: ResourceOverviewProps) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 40, y: 40, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<LayoutNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadResources = useCallback(async () => {
    if (!namespace) {
      setApplications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const resourceTypes = [
        { path: namespace ? `/api/v1/namespaces/${namespace}/pods` : '/api/v1/pods', kind: 'Pod' },
        { path: namespace ? `/apis/apps/v1/namespaces/${namespace}/deployments` : '/apis/apps/v1/deployments', kind: 'Deployment' },
        { path: namespace ? `/apis/apps/v1/namespaces/${namespace}/replicasets` : '/apis/apps/v1/replicasets', kind: 'ReplicaSet' },
        { path: namespace ? `/apis/apps/v1/namespaces/${namespace}/statefulsets` : '/apis/apps/v1/statefulsets', kind: 'StatefulSet' },
        { path: namespace ? `/apis/apps/v1/namespaces/${namespace}/daemonsets` : '/apis/apps/v1/daemonsets', kind: 'DaemonSet' },
        { path: namespace ? `/api/v1/namespaces/${namespace}/services` : '/api/v1/services', kind: 'Service' },
        { path: namespace ? `/api/v1/namespaces/${namespace}/configmaps` : '/api/v1/configmaps', kind: 'ConfigMap' },
        { path: namespace ? `/api/v1/namespaces/${namespace}/secrets` : '/api/v1/secrets', kind: 'Secret' },
        { path: namespace ? `/api/v1/namespaces/${namespace}/persistentvolumeclaims` : '/api/v1/persistentvolumeclaims', kind: 'PersistentVolumeClaim' },
        { path: namespace ? `/apis/batch/v1/namespaces/${namespace}/jobs` : '/apis/batch/v1/jobs', kind: 'Job' },
        { path: namespace ? `/apis/batch/v1/namespaces/${namespace}/cronjobs` : '/apis/batch/v1/cronjobs', kind: 'CronJob' },
        { path: namespace ? `/apis/networking.k8s.io/v1/namespaces/${namespace}/ingresses` : '/apis/networking.k8s.io/v1/ingresses', kind: 'Ingress' },
      ];

      const results = await Promise.allSettled(
        resourceTypes.map(async ({ path, kind }) => {
          try {
            const data = await fetchApi<K8sResourceList>(path);
            // Set kind on each item since Kubernetes list API doesn't include it
            return (data.items || []).map(item => ({ ...item, kind }));
          } catch {
            return [];
          }
        })
      );

      const allResources: K8sResource[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          allResources.push(...result.value);
        }
      });

      const layoutApps = buildLayout(allResources);
      setApplications(layoutApps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load resources');
    } finally {
      setIsLoading(false);
    }
  }, [namespace]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  }, [transform.x, transform.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setTransform((t) => ({
        ...t,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }));
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(transform.scale * delta, 0.1), 3);
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
      const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);
      setTransform({ x: newX, y: newY, scale: newScale });
    }
  }, [transform]);

  const zoomIn = () => setTransform((t) => ({ ...t, scale: Math.min(t.scale * 1.2, 3) }));
  const zoomOut = () => setTransform((t) => ({ ...t, scale: Math.max(t.scale / 1.2, 0.1) }));
  const fitView = () => {
    if (!containerRef.current || applications.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const totalWidth = Math.max(...applications.map((a) => a.x + a.width), 800);
    const totalHeight = Math.max(...applications.map((a) => a.y + a.height), 600);
    const scaleX = (rect.width - 80) / totalWidth;
    const scaleY = (rect.height - 80) / totalHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    setTransform({ x: 40, y: 40, scale });
  };

  // Calculate total content bounds
  const contentBounds = useMemo(() => {
    if (applications.length === 0) return { width: 800, height: 600 };
    const maxX = Math.max(...applications.map((a) => a.x + a.width));
    const maxY = Math.max(...applications.map((a) => a.y + a.height));
    return { width: maxX + 100, height: maxY + 100 };
  }, [applications]);
  
  // Auto fit view when applications change
  useEffect(() => {
    if (applications.length > 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scaleX = (rect.width - 80) / contentBounds.width;
      const scaleY = (rect.height - 80) / contentBounds.height;
      const scale = Math.min(scaleX, scaleY, 1);
      setTransform({ x: 40, y: 40, scale });
    }
  }, [applications, contentBounds]);

  // Clear selected node when namespace changes
  useEffect(() => {
    setSelectedNode(null);
  }, [namespace]);

  // Handle node click
  const handleNodeClick = useCallback((node: LayoutNode) => {
    setSelectedNode(node);
  }, []);

  // Convert selected node to V1ObjectReference for DetailPanel
  const selectedResource: V1ObjectReference | null = selectedNode ? {
    name: selectedNode.resource.metadata.name,
    namespace: selectedNode.resource.metadata.namespace,
    uid: selectedNode.resource.metadata.uid,
    kind: selectedNode.resource.kind,
    apiVersion: selectedNode.resource.apiVersion,
  } : null;

  const isDetailPanelOpen = selectedNode !== null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-950">
        <div className="flex items-center gap-2 text-gray-500">
          <RefreshCw className="animate-spin" size={20} />
          <span>Loading resources...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-white dark:bg-gray-950">
        <div className="text-red-500">{error}</div>
        <button
          onClick={loadResources}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-md transition-colors"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
    <div className={`h-full w-full relative bg-gray-100 dark:bg-gray-900 overflow-hidden transition-all duration-300 ${isDetailPanelOpen ? 'mr-120' : ''}`}>
      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <button onClick={loadResources} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-l-lg" title="Refresh">
          <RefreshCw size={16} className="text-gray-600 dark:text-gray-400" />
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
        <button onClick={zoomIn} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700" title="Zoom In">
          <ZoomIn size={16} className="text-gray-600 dark:text-gray-400" />
        </button>
        <button onClick={zoomOut} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700" title="Zoom Out">
          <ZoomOut size={16} className="text-gray-600 dark:text-gray-400" />
        </button>
        <button onClick={fitView} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700" title="Fit View">
          <Maximize2 size={16} className="text-gray-600 dark:text-gray-400" />
        </button>
        <div className="px-2 text-xs text-gray-500 border-l border-gray-200 dark:border-gray-700 rounded-r-lg">
          {Math.round(transform.scale * 100)}%
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Connections</div>
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#64748b" strokeWidth="2" /></svg>
            <span className="text-gray-500 dark:text-gray-400">Owner</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4,2" /></svg>
            <span className="text-gray-500 dark:text-gray-400">Selector</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#06b6d4" strokeWidth="2" strokeDasharray="4,2" /></svg>
            <span className="text-gray-500 dark:text-gray-400">Service</span>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          width={contentBounds.width}
          height={contentBounds.height}
          style={{ 
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, 
            transformOrigin: '0 0' 
          }}
        >
          <defs>
            <marker id="arrow-owner" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
            </marker>
            <marker id="arrow-selector" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
            </marker>
            <marker id="arrow-service" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#06b6d4" />
            </marker>
            <marker id="arrow-ingress" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#14b8a6" />
            </marker>
          </defs>
          {applications.map((app) => (
            <ApplicationGroup key={app.id} application={app} onNodeClick={handleNodeClick} />
          ))}
        </svg>
      </div>
    </div>
    <ResourcePanel
      isOpen={isDetailPanelOpen}
      onClose={() => setSelectedNode(null)}
      resource={selectedResource}
    />
    </>
  );
}

// Application component
function ApplicationGroup({ application, onNodeClick }: { application: Application; onNodeClick: (node: LayoutNode) => void }) {
  const nodeMap = useMemo(() => new Map(application.nodes.map((n) => [n.uid, n])), [application.nodes]);

  return (
    <g>
      {/* Application background */}
      <rect
        x={application.x}
        y={application.y}
        width={application.width}
        height={application.height}
        rx={12}
        fill="white"
        stroke="#e5e7eb"
        strokeWidth={1}
        className="dark:fill-gray-800 dark:stroke-gray-700"
      />
      
      {/* Application header */}
      <text
        x={application.x + 12}
        y={application.y + 16}
        fontSize={11}
        fontWeight={600}
        className="fill-gray-600 dark:fill-gray-300"
      >
        <tspan style={{ textOverflow: 'ellipsis' }}>
          {application.name.length > 28 ? application.name.slice(0, 26) + '…' : application.name}
        </tspan>
      </text>
      {application.namespace && (
        <text
          x={application.x + 12}
          y={application.y + 30}
          fontSize={10}
          className="fill-gray-400 dark:fill-gray-500"
        >
          {application.namespace}
        </text>
      )}

      {/* Edges */}
      {application.edges.map((edge, i) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return null;
        return <EdgeLine key={i} from={from} to={to} type={edge.type} />;
      })}

      {/* Nodes */}
      {application.nodes.map((node) => (
        <ResourceNodeSVG key={node.uid} node={node} onClick={() => onNodeClick(node)} />
      ))}
    </g>
  );
}

// Edge component
function EdgeLine({ from, to, type }: { from: LayoutNode; to: LayoutNode; type: LayoutEdge['type'] }) {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  
  const midX = (startX + endX) / 2;
  const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
  
  const colors: Record<string, string> = {
    owner: '#64748b',
    selector: '#8b5cf6',
    service: '#06b6d4',
    ingress: '#14b8a6',
  };
  
  const dashArray = type === 'owner' ? undefined : '6,3';

  return (
    <path
      d={path}
      fill="none"
      stroke={colors[type]}
      strokeWidth={2}
      strokeDasharray={dashArray}
      markerEnd={`url(#arrow-${type})`}
    />
  );
}

// Resource node component (SVG)
function ResourceNodeSVG({ node, onClick }: { node: LayoutNode; onClick: () => void }) {
  const { resource, x, y, width, height } = node;
  const colors = kindColors[resource.kind] || defaultColors;
  const Icon = kindIcons[resource.kind] || Hexagon;
  const { status, color: statusColor } = getStatus(resource);
  
  // Determine if we should show status text (replica counts like 1/1, 2/2)
  const showStatusText = ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'].includes(resource.kind);
  
  // Truncate name based on width
  const maxNameChars = Math.floor((width - 40) / 6.5);
  const displayName = resource.metadata.name.length > maxNameChars 
    ? resource.metadata.name.slice(0, maxNameChars - 2) + '...' 
    : resource.metadata.name;

  return (
    <g 
      transform={`translate(${x}, ${y})`} 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ cursor: 'pointer' }}
      className="hover:opacity-80 transition-opacity"
    >
      {/* Background */}
      <rect
        width={width}
        height={height}
        rx={8}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={2}
      />
      
      {/* Status indicator and optional count */}
      <circle cx={width - 12} cy={14} r={5} fill={statusColor} />
      {showStatusText && (
        <text x={width - 24} y={18} fontSize={10} fill="#6b7280" textAnchor="end">
          {status}
        </text>
      )}
      
      {/* Kind icon and label */}
      <g transform="translate(10, 10)">
        <foreignObject width={18} height={18}>
          <div style={{ color: colors.text }}><Icon size={16} /></div>
        </foreignObject>
        <text x={22} y={13} fontSize={11} fill={colors.text} fontWeight={600}>
          {resource.kind}
        </text>
      </g>
      
      {/* Resource name */}
      <text
        x={10}
        y={height - 12}
        fontSize={12}
        fontWeight={600}
        fill="#1f2937"
      >
        {displayName}
      </text>
    </g>
  );
}

// Build layout from resources
function buildLayout(resources: K8sResource[]): Application[] {
  const uidToResource = new Map<string, K8sResource>();
  resources.forEach((r) => {
    if (r.metadata.uid) uidToResource.set(r.metadata.uid, r);
  });

  // Build connections graph
  const connections = new Map<string, Set<string>>();
  const edges: Map<string, LayoutEdge[]> = new Map();
  
  const addConnection = (uid1: string, uid2: string) => {
    if (!connections.has(uid1)) connections.set(uid1, new Set());
    if (!connections.has(uid2)) connections.set(uid2, new Set());
    connections.get(uid1)!.add(uid2);
    connections.get(uid2)!.add(uid1);
  };
  
  const addEdge = (from: string, to: string, type: LayoutEdge['type']) => {
    const key = `${from}-${to}`;
    if (!edges.has(key)) {
      edges.set(key, []);
    }
    edges.get(key)!.push({ from, to, type });
  };

  // Owner references
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();
  
  resources.forEach((r) => {
    const owners = (r.metadata.ownerReferences || []).filter((o) => uidToResource.has(o.uid));
    if (owners.length > 0) {
      const owner = owners[0];
      parentMap.set(r.metadata.uid, owner.uid);
      if (!childrenMap.has(owner.uid)) childrenMap.set(owner.uid, []);
      childrenMap.get(owner.uid)!.push(r.metadata.uid);
      addConnection(r.metadata.uid, owner.uid);
      addEdge(owner.uid, r.metadata.uid, 'owner');
    }
  });

  // Service selectors -> Pods
  resources.forEach((r) => {
    if (r.kind !== 'Service') return;
    const selector = (r.spec as { selector?: Record<string, string> })?.selector;
    if (!selector || Object.keys(selector).length === 0) return;
    
    resources.filter((p) => p.kind === 'Pod' && p.metadata.namespace === r.metadata.namespace).forEach((pod) => {
      const labels = pod.metadata.labels || {};
      if (Object.entries(selector).every(([k, v]) => labels[k] === v)) {
        addConnection(r.metadata.uid, pod.metadata.uid);
        addEdge(pod.metadata.uid, r.metadata.uid, 'service');
      }
    });
  });

  // Controller selectors -> Pods
  const controllerKinds = ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job'];
  resources.forEach((r) => {
    if (!controllerKinds.includes(r.kind)) return;
    const matchLabels = (r.spec as { selector?: { matchLabels?: Record<string, string> } })?.selector?.matchLabels;
    if (!matchLabels || Object.keys(matchLabels).length === 0) return;
    
    resources.filter((p) => p.kind === 'Pod' && p.metadata.namespace === r.metadata.namespace).forEach((pod) => {
      const labels = pod.metadata.labels || {};
      if (Object.entries(matchLabels).every(([k, v]) => labels[k] === v)) {
        if (parentMap.get(pod.metadata.uid) !== r.metadata.uid) {
          addConnection(r.metadata.uid, pod.metadata.uid);
          addEdge(r.metadata.uid, pod.metadata.uid, 'selector');
        }
      }
    });
  });

  // Build lookup maps for ConfigMaps, Secrets, and PVCs by namespace/name
  const configMapsByKey = new Map<string, K8sResource>();
  const secretsByKey = new Map<string, K8sResource>();
  const pvcsByKey = new Map<string, K8sResource>();
  
  resources.forEach((r) => {
    const key = `${r.metadata.namespace || ''}/${r.metadata.name}`;
    if (r.kind === 'ConfigMap') configMapsByKey.set(key, r);
    else if (r.kind === 'Secret') secretsByKey.set(key, r);
    else if (r.kind === 'PersistentVolumeClaim') pvcsByKey.set(key, r);
  });

  // Type for container spec
  type ContainerSpec = {
    env?: Array<{
      valueFrom?: {
        configMapKeyRef?: { name: string };
        secretKeyRef?: { name: string };
      };
    }>;
    envFrom?: Array<{
      configMapRef?: { name: string };
      secretRef?: { name: string };
    }>;
  };

  // Type for volume spec
  type VolumeSpec = {
    name: string;
    configMap?: { name: string };
    secret?: { secretName: string };
    persistentVolumeClaim?: { claimName: string };
    projected?: {
      sources?: Array<{
        configMap?: { name: string };
        secret?: { name: string };
      }>;
    };
  };

  // Helper to extract refs from containers
  const extractContainerRefs = (
    containers: ContainerSpec[] | undefined,
    referencedConfigMaps: Set<string>,
    referencedSecrets: Set<string>
  ) => {
    containers?.forEach((container) => {
      container.env?.forEach((env) => {
        if (env.valueFrom?.configMapKeyRef?.name) {
          referencedConfigMaps.add(env.valueFrom.configMapKeyRef.name);
        }
        if (env.valueFrom?.secretKeyRef?.name) {
          referencedSecrets.add(env.valueFrom.secretKeyRef.name);
        }
      });
      container.envFrom?.forEach((envFrom) => {
        if (envFrom.configMapRef?.name) {
          referencedConfigMaps.add(envFrom.configMapRef.name);
        }
        if (envFrom.secretRef?.name) {
          referencedSecrets.add(envFrom.secretRef.name);
        }
      });
    });
  };

  // Helper to find the root owner of a resource (for grouping detection)
  const findRootOwner = (uid: string): string => {
    const parent = parentMap.get(uid);
    if (!parent) return uid;
    return findRootOwner(parent);
  };

  // First pass: count how many different owner chains reference each ConfigMap/Secret/PVC
  // This helps us identify shared resources that would incorrectly merge unrelated apps
  const configMapOwners = new Map<string, Set<string>>();
  const secretOwners = new Map<string, Set<string>>();
  const pvcOwners = new Map<string, Set<string>>();

  resources.forEach((r) => {
    if (r.kind !== 'Pod') return;
    const ns = r.metadata.namespace || '';
    const rootOwner = findRootOwner(r.metadata.uid);
    const spec = r.spec as {
      containers?: ContainerSpec[];
      initContainers?: ContainerSpec[];
      volumes?: VolumeSpec[];
    };

    const referencedConfigMaps = new Set<string>();
    const referencedSecrets = new Set<string>();
    const referencedPVCs = new Set<string>();

    spec.volumes?.forEach((vol) => {
      if (vol.configMap?.name) referencedConfigMaps.add(vol.configMap.name);
      if (vol.secret?.secretName) referencedSecrets.add(vol.secret.secretName);
      if (vol.persistentVolumeClaim?.claimName) referencedPVCs.add(vol.persistentVolumeClaim.claimName);
      vol.projected?.sources?.forEach((source) => {
        if (source.configMap?.name) referencedConfigMaps.add(source.configMap.name);
        if (source.secret?.name) referencedSecrets.add(source.secret.name);
      });
    });
    extractContainerRefs(spec.containers, referencedConfigMaps, referencedSecrets);
    extractContainerRefs(spec.initContainers, referencedConfigMaps, referencedSecrets);

    // Track which root owners reference each resource
    referencedConfigMaps.forEach((name) => {
      const key = `${ns}/${name}`;
      if (!configMapOwners.has(key)) configMapOwners.set(key, new Set());
      configMapOwners.get(key)!.add(rootOwner);
    });
    referencedSecrets.forEach((name) => {
      const key = `${ns}/${name}`;
      if (!secretOwners.has(key)) secretOwners.set(key, new Set());
      secretOwners.get(key)!.add(rootOwner);
    });
    referencedPVCs.forEach((name) => {
      const key = `${ns}/${name}`;
      if (!pvcOwners.has(key)) pvcOwners.set(key, new Set());
      pvcOwners.get(key)!.add(rootOwner);
    });
  });

  // Track which ConfigMaps/Secrets/PVCs are shared (used by multiple owner chains)
  const sharedResources = new Set<string>();
  configMapOwners.forEach((owners, key) => {
    if (owners.size > 1) {
      const cm = configMapsByKey.get(key);
      if (cm) sharedResources.add(cm.metadata.uid);
    }
  });
  secretOwners.forEach((owners, key) => {
    if (owners.size > 1) {
      const secret = secretsByKey.get(key);
      if (secret) sharedResources.add(secret.metadata.uid);
    }
  });
  pvcOwners.forEach((owners, key) => {
    if (owners.size > 1) {
      const pvc = pvcsByKey.get(key);
      if (pvc) sharedResources.add(pvc.metadata.uid);
    }
  });

  // Second pass: connect Pods to non-shared ConfigMaps, Secrets, and PVCs
  resources.forEach((r) => {
    if (r.kind !== 'Pod') return;
    const ns = r.metadata.namespace || '';
    const spec = r.spec as {
      containers?: ContainerSpec[];
      initContainers?: ContainerSpec[];
      volumes?: VolumeSpec[];
    };

    const referencedConfigMaps = new Set<string>();
    const referencedSecrets = new Set<string>();
    const referencedPVCs = new Set<string>();

    spec.volumes?.forEach((vol) => {
      if (vol.configMap?.name) referencedConfigMaps.add(vol.configMap.name);
      if (vol.secret?.secretName) referencedSecrets.add(vol.secret.secretName);
      if (vol.persistentVolumeClaim?.claimName) referencedPVCs.add(vol.persistentVolumeClaim.claimName);
      vol.projected?.sources?.forEach((source) => {
        if (source.configMap?.name) referencedConfigMaps.add(source.configMap.name);
        if (source.secret?.name) referencedSecrets.add(source.secret.name);
      });
    });
    extractContainerRefs(spec.containers, referencedConfigMaps, referencedSecrets);
    extractContainerRefs(spec.initContainers, referencedConfigMaps, referencedSecrets);

    // Create connections only for non-shared ConfigMaps
    referencedConfigMaps.forEach((name) => {
      const cm = configMapsByKey.get(`${ns}/${name}`);
      if (cm && !sharedResources.has(cm.metadata.uid)) {
        addConnection(r.metadata.uid, cm.metadata.uid);
        addEdge(cm.metadata.uid, r.metadata.uid, 'owner');
      }
    });

    // Create connections only for non-shared Secrets
    referencedSecrets.forEach((name) => {
      const secret = secretsByKey.get(`${ns}/${name}`);
      if (secret && !sharedResources.has(secret.metadata.uid)) {
        addConnection(r.metadata.uid, secret.metadata.uid);
        addEdge(secret.metadata.uid, r.metadata.uid, 'owner');
      }
    });

    // Create connections only for non-shared PVCs
    referencedPVCs.forEach((name) => {
      const pvc = pvcsByKey.get(`${ns}/${name}`);
      if (pvc && !sharedResources.has(pvc.metadata.uid)) {
        addConnection(r.metadata.uid, pvc.metadata.uid);
        addEdge(pvc.metadata.uid, r.metadata.uid, 'owner');
      }
    });
  });

  // Group by app.kubernetes.io/part-of label (meta-application grouping)
  // This groups related components like argocd-server, argocd-redis, argocd-repo-server together
  // Also check parent resources for the part-of label (since Pods often don't have it but their Deployments do)
  const getGroupLabel = (r: K8sResource): string | undefined => {
    const labels = r.metadata.labels || {};
    
    // Check direct labels in priority order
    const directLabel = labels[APP_LABELS.PART_OF] || 
                        labels[APP_LABELS.ARGOCD_INSTANCE] ||
                        labels[APP_LABELS.INSTANCE];
    if (directLabel) return directLabel;
    
    // Check parent via owner reference (e.g., Pod -> ReplicaSet)
    const ownerRef = r.metadata.ownerReferences?.[0];
    if (ownerRef) {
      const parent = uidToResource.get(ownerRef.uid);
      if (parent) {
        const parentLabels = parent.metadata.labels || {};
        const parentLabel = parentLabels[APP_LABELS.PART_OF] || 
                           parentLabels[APP_LABELS.ARGOCD_INSTANCE] ||
                           parentLabels[APP_LABELS.INSTANCE];
        if (parentLabel) return parentLabel;
        
        // Go one more level up (Pod -> RS -> Deployment)
        const grandparentRef = parent.metadata.ownerReferences?.[0];
        if (grandparentRef) {
          const grandparent = uidToResource.get(grandparentRef.uid);
          if (grandparent) {
            const gpLabels = grandparent.metadata.labels || {};
            const gpLabel = gpLabels[APP_LABELS.PART_OF] || 
                           gpLabels[APP_LABELS.ARGOCD_INSTANCE] ||
                           gpLabels[APP_LABELS.INSTANCE];
            if (gpLabel) return gpLabel;
          }
        }
      }
    }
    return undefined;
  };

  // Build groups based on labels
  const labelGroups = new Map<string, string[]>();
  resources.forEach((r) => {
    const groupLabel = getGroupLabel(r);
    if (groupLabel) {
      const key = `${r.metadata.namespace || ''}/${groupLabel}`;
      if (!labelGroups.has(key)) labelGroups.set(key, []);
      labelGroups.get(key)!.push(r.metadata.uid);
    }
  });
  
  // Connect all resources within the same label group
  labelGroups.forEach((uids) => {
    // Connect all resources in the same group to form a single application
    for (let i = 1; i < uids.length; i++) {
      addConnection(uids[0], uids[i]);
    }
  });

  // Find connected components
  const visited = new Set<string>();
  const components: string[][] = [];
  
  function dfs(uid: string, component: string[]) {
    if (visited.has(uid)) return;
    visited.add(uid);
    component.push(uid);
    (connections.get(uid) || new Set()).forEach((n) => dfs(n, component));
  }
  
  resources.forEach((r) => {
    if (!visited.has(r.metadata.uid)) {
      const component: string[] = [];
      dfs(r.metadata.uid, component);
      if (component.length > 0) components.push(component);
    }
  });

  // Helper to check if a resource has recommended app labels (or legacy fallbacks)
  const hasAppLabels = (r: K8sResource): boolean => {
    const labels = r.metadata.labels || {};
    return !!(
      // Recommended Kubernetes labels
      labels[APP_LABELS.PART_OF] ||
      labels[APP_LABELS.INSTANCE] ||
      labels[APP_LABELS.NAME] ||
      // ArgoCD specific
      labels[APP_LABELS.ARGOCD_INSTANCE] ||
      // Legacy fallbacks
      labels[APP_LABELS.APP] ||
      labels[APP_LABELS.K8S_APP] ||
      labels[APP_LABELS.RELEASE]
    );
  };

  // Filter components to only include those with at least one resource having app labels
  const filteredComponents = components.filter((component) => {
    return component.some((uid) => {
      const r = uidToResource.get(uid);
      if (!r) return false;
      // Check direct labels
      if (hasAppLabels(r)) return true;
      // Check parent labels (for pods that inherit from deployments)
      const ownerRef = r.metadata.ownerReferences?.[0];
      if (ownerRef) {
        const parent = uidToResource.get(ownerRef.uid);
        if (parent && hasAppLabels(parent)) return true;
        // Check grandparent
        const gpRef = parent?.metadata.ownerReferences?.[0];
        if (gpRef) {
          const grandparent = uidToResource.get(gpRef.uid);
          if (grandparent && hasAppLabels(grandparent)) return true;
        }
      }
      return false;
    });
  });

  filteredComponents.sort((a, b) => b.length - a.length);

  // Build applications with layout
  const applications: Application[] = [];
  
  // Kind priority for column sorting
  const kindPriority: Record<string, number> = {
    'Deployment': 0, 'StatefulSet': 0, 'DaemonSet': 0, 'CronJob': 0,
    'Job': 1, 'ReplicaSet': 2, 'Pod': 3,
    'Service': 10, 'Ingress': 11, 'ConfigMap': 12, 'Secret': 13, 'PersistentVolumeClaim': 14
  };

  filteredComponents.forEach((component, idx) => {
    const componentSet = new Set(component);
    const componentResources = component.map((uid) => uidToResource.get(uid)!).filter(Boolean);
    
    // Identify root nodes (no parent in this component)
    const isRoot = (uid: string) => {
      const parent = parentMap.get(uid);
      return !parent || !componentSet.has(parent);
    };
    
    // Categorize roots by kind
    const roots = component.filter(isRoot);
    const ownerRoots = roots.filter(uid => {
      const r = uidToResource.get(uid)!;
      return ['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob', 'Job'].includes(r.kind);
    });
    const serviceRoots = roots.filter(uid => {
      const r = uidToResource.get(uid)!;
      return r.kind === 'Service' || r.kind === 'Ingress';
    });
    const configRoots = roots.filter(uid => {
      const r = uidToResource.get(uid)!;
      return ['ConfigMap', 'Secret', 'PersistentVolumeClaim'].includes(r.kind);
    });
    const otherRoots = roots.filter(uid => {
      const r = uidToResource.get(uid)!;
      return !['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob', 'Job', 'Service', 'Ingress', 'ConfigMap', 'Secret', 'PersistentVolumeClaim'].includes(r.kind);
    });

    // Layout nodes in columns by depth
    const nodePositions = new Map<string, { x: number; y: number }>();
    const depthColumns = new Map<number, string[]>();
    const nodeDepth = new Map<string, number>();
    
    // BFS to compute depth from roots
    function computeDepths(rootUid: string, startDepth: number) {
      const queue: { uid: string; depth: number }[] = [{ uid: rootUid, depth: startDepth }];
      while (queue.length > 0) {
        const { uid, depth } = queue.shift()!;
        if (nodeDepth.has(uid)) continue;
        nodeDepth.set(uid, depth);
        
        const children = (childrenMap.get(uid) || []).filter((c) => componentSet.has(c));
        children.forEach((childUid) => {
          if (!nodeDepth.has(childUid)) {
            queue.push({ uid: childUid, depth: depth + 1 });
          }
        });
      }
    }
    
    // Compute depths for owner hierarchy
    [...ownerRoots, ...otherRoots].forEach((uid) => computeDepths(uid, 0));
    
    // Find max depth
    let maxOwnerDepth = 0;
    nodeDepth.forEach((d) => { maxOwnerDepth = Math.max(maxOwnerDepth, d); });
    
    // Position services/configs: left if they have children, right otherwise
    [...serviceRoots, ...configRoots].forEach((uid) => {
      if (!nodeDepth.has(uid)) {
        const children = (childrenMap.get(uid) || []).filter((c) => componentSet.has(c));
        nodeDepth.set(uid, children.length > 0 ? -1 : maxOwnerDepth + 1);
      }
    });
    
    // Put remaining unpositioned nodes
    component.forEach((uid) => {
      if (!nodeDepth.has(uid)) {
        nodeDepth.set(uid, 0);
      }
    });
    
    // Find min depth (might be -1 for services)
    let minDepth = 0;
    nodeDepth.forEach((d) => { minDepth = Math.min(minDepth, d); });
    
    // Normalize depths so min is 0
    if (minDepth < 0) {
      const offset = -minDepth;
      nodeDepth.forEach((d, uid) => nodeDepth.set(uid, d + offset));
      maxOwnerDepth += offset;
    }
    
    // Group by depth
    component.forEach((uid) => {
      const depth = nodeDepth.get(uid) || 0;
      if (!depthColumns.has(depth)) depthColumns.set(depth, []);
      depthColumns.get(depth)!.push(uid);
    });
    
    // Sort each column
    depthColumns.forEach((uids) => {
      uids.sort((a, b) => {
        const ra = uidToResource.get(a)!;
        const rb = uidToResource.get(b)!;
        const pa = kindPriority[ra.kind] ?? 99;
        const pb = kindPriority[rb.kind] ?? 99;
        if (pa !== pb) return pa - pb;
        return ra.metadata.name.localeCompare(rb.metadata.name);
      });
    });
    
    // Position nodes by column
    let maxX = 0;
    let maxY = APP_PADDING + APP_HEADER;
    
    const depths = Array.from(depthColumns.keys()).sort((a, b) => a - b);
    depths.forEach((depth) => {
      const x = APP_PADDING + depth * (NODE_WIDTH + NODE_GAP_X);
      let y = APP_PADDING + APP_HEADER;
      
      depthColumns.get(depth)!.forEach((uid) => {
        nodePositions.set(uid, { x, y });
        maxY = Math.max(maxY, y + NODE_HEIGHT);
        y += NODE_HEIGHT + NODE_GAP_Y;
      });
      
      maxX = Math.max(maxX, x + NODE_WIDTH);
    });

    const appWidth = maxX + APP_PADDING;
    const appHeight = maxY + APP_PADDING;
    
    const firstResource = componentResources[0];
    
    // Prefer workload controllers for naming (they typically have the canonical app labels)
    const namingPriority = ['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob', 'Job', 'ReplicaSet'];
    const workloadResources = componentResources
      .filter(r => namingPriority.includes(r.kind))
      .sort((a, b) => namingPriority.indexOf(a.kind) - namingPriority.indexOf(b.kind));
    
    // Find the best name for the application - prefer group label (part-of)
    let appName: string | undefined;
    
    // First, check workload controllers for group labels (most authoritative)
    for (const r of workloadResources) {
      const groupLabel = r.metadata.labels?.[APP_LABELS.PART_OF] ||
                        r.metadata.labels?.[APP_LABELS.ARGOCD_INSTANCE];
      if (groupLabel) {
        appName = groupLabel;
        break;
      }
    }
    
    // Then check all resources for group labels
    if (!appName) {
      for (const r of componentResources) {
        const groupLabel = r.metadata.labels?.[APP_LABELS.PART_OF] ||
                          r.metadata.labels?.[APP_LABELS.ARGOCD_INSTANCE];
        if (groupLabel) {
          appName = groupLabel;
          break;
        }
      }
    }
    
    // Fall back to app name from workload controllers first
    if (!appName) {
      for (const r of workloadResources) {
        const name = getAppName(r, uidToResource);
        if (name) { appName = name; break; }
      }
    }
    
    // Then try any resource with an app name (using owner chain traversal)
    if (!appName) {
      for (const r of componentResources) {
        const name = getAppName(r, uidToResource);
        if (name) { appName = name; break; }
      }
    }
    
    // Final fallback: use the workload controller's name, or root resource name
    if (!appName) {
      if (workloadResources.length > 0) {
        appName = workloadResources[0].metadata.name;
      } else {
        const rootResources = componentResources.filter(r => !parentMap.has(r.metadata.uid));
        const nameSource = rootResources[0] || firstResource;
        appName = nameSource.metadata.name;
      }
    }

    const appNodes: LayoutNode[] = component.map((uid) => {
      const pos = nodePositions.get(uid)!;
      return {
        uid,
        resource: uidToResource.get(uid)!,
        x: pos.x,
        y: pos.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
    });

    const appEdges: LayoutEdge[] = [];
    edges.forEach((edgeList) => {
      edgeList.forEach((edge) => {
        if (componentSet.has(edge.from) && componentSet.has(edge.to)) {
          appEdges.push(edge);
        }
      });
    });

    applications.push({
      id: `app-${idx}`,
      name: appName,
      namespace: firstResource.metadata.namespace,
      nodes: appNodes,
      edges: appEdges,
      x: 0,
      y: 0,
      width: appWidth,
      height: appHeight,
    });
  });

  // Arrange applications using row-based layout
  // Sort by height (tallest first) for better packing
  applications.sort((a, b) => b.height - a.height);
  
  const MAX_ROW_WIDTH = 1800;
  let currentX = 0;
  let rowHeight = 0;
  let rowApps: { app: Application; tempX: number }[] = [];
  
  const rows: { app: Application; tempX: number }[][] = [];
  
  applications.forEach((app) => {
    // Check if app fits in current row
    if (currentX + app.width > MAX_ROW_WIDTH && rowApps.length > 0) {
      // Start new row
      rows.push([...rowApps]);
      currentX = 0;
      rowHeight = 0;
      rowApps = [];
    }
    
    rowApps.push({ app, tempX: currentX });
    currentX += app.width + APP_GAP;
    rowHeight = Math.max(rowHeight, app.height);
  });
  
  // Don't forget the last row
  if (rowApps.length > 0) {
    rows.push(rowApps);
  }
  
  // Position applications and offset all node positions
  let y = 0;
  rows.forEach((row) => {
    const maxHeight = Math.max(...row.map((r) => r.app.height));
    row.forEach(({ app, tempX }) => {
      const finalX = tempX;
      const finalY = y + (maxHeight - app.height) / 2;
      
      // Offset all nodes by application position
      app.nodes.forEach((node) => {
        node.x += finalX;
        node.y += finalY;
      });
      
      app.x = finalX;
      app.y = finalY;
    });
    y += maxHeight + APP_GAP;
  });

  return applications;
}

export default ResourceOverview;