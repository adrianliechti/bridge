import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box,
  Rocket,
  Ghost,
  Database,
  Zap,
  Clock,
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
  Shield,
  Network,
  Route,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { fetchApi } from '../api/kubernetes';

import { ResourcePanel } from './ResourcePanel';
import type { V1ObjectReference, V1ObjectMeta } from '@kubernetes/client-node';

// Strict resource type with required fields for this component
interface K8sResource {
  apiVersion: string;
  kind: string;
  metadata: V1ObjectMeta & {
    name: string;
    uid: string;
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
  DaemonSet: Ghost,
  StatefulSet: Database,
  Job: Zap,
  CronJob: Clock,
  Service: Share2,
  Ingress: Globe,
  Gateway: Network,
  HTTPRoute: Route,
  GRPCRoute: Route,
  NetworkPolicy: Shield,
  PersistentVolume: HardDrive,
  PersistentVolumeClaim: Disc,
  ConfigMap: FileText,
  Secret: KeyRound,
  Node: Server,
};

// Resource kind to color mapping (Tailwind colors for light/dark theme support)
const kindColors: Record<string, { bg: string; bgDark: string; border: string; borderDark: string; text: string; textDark: string }> = {
  Pod: { bg: '#dcfce7', bgDark: '#14532d', border: '#22c55e', borderDark: '#4ade80', text: '#166534', textDark: '#86efac' },
  Deployment: { bg: '#dbeafe', bgDark: '#1e3a8a', border: '#3b82f6', borderDark: '#60a5fa', text: '#1e40af', textDark: '#93c5fd' },
  DaemonSet: { bg: '#f3e8ff', bgDark: '#581c87', border: '#a855f7', borderDark: '#c084fc', text: '#6b21a8', textDark: '#d8b4fe' },
  StatefulSet: { bg: '#ede9fe', bgDark: '#5b21b6', border: '#8b5cf6', borderDark: '#a78bfa', text: '#5b21b6', textDark: '#c4b5fd' },
  Job: { bg: '#fef3c7', bgDark: '#78350f', border: '#f59e0b', borderDark: '#fbbf24', text: '#92400e', textDark: '#fcd34d' },
  CronJob: { bg: '#ffedd5', bgDark: '#7c2d12', border: '#f97316', borderDark: '#fb923c', text: '#9a3412', textDark: '#fdba74' },
  Service: { bg: '#cffafe', bgDark: '#164e63', border: '#06b6d4', borderDark: '#22d3ee', text: '#155e75', textDark: '#67e8f9' },
  Ingress: { bg: '#ccfbf1', bgDark: '#134e4a', border: '#14b8a6', borderDark: '#2dd4bf', text: '#115e59', textDark: '#5eead4' },
  Gateway: { bg: '#d1fae5', bgDark: '#065f46', border: '#10b981', borderDark: '#34d399', text: '#065f46', textDark: '#6ee7b7' },
  HTTPRoute: { bg: '#a7f3d0', bgDark: '#047857', border: '#34d399', borderDark: '#6ee7b7', text: '#047857', textDark: '#a7f3d0' },
  GRPCRoute: { bg: '#a7f3d0', bgDark: '#047857', border: '#34d399', borderDark: '#6ee7b7', text: '#047857', textDark: '#a7f3d0' },
  NetworkPolicy: { bg: '#fef3c7', bgDark: '#78350f', border: '#f59e0b', borderDark: '#fbbf24', text: '#92400e', textDark: '#fcd34d' },
  PersistentVolume: { bg: '#f1f5f9', bgDark: '#334155', border: '#64748b', borderDark: '#94a3b8', text: '#334155', textDark: '#cbd5e1' },
  PersistentVolumeClaim: { bg: '#f8fafc', bgDark: '#475569', border: '#94a3b8', borderDark: '#cbd5e1', text: '#475569', textDark: '#e2e8f0' },
  ConfigMap: { bg: '#fef9c3', bgDark: '#713f12', border: '#eab308', borderDark: '#facc15', text: '#854d0e', textDark: '#fde047' },
  Secret: { bg: '#fee2e2', bgDark: '#7f1d1d', border: '#ef4444', borderDark: '#f87171', text: '#991b1b', textDark: '#fca5a5' },
};

const defaultColors = { bg: '#f3f4f6', bgDark: '#374151', border: '#9ca3af', borderDark: '#6b7280', text: '#374151', textDark: '#d1d5db' };

// Helper function to get the appropriate color based on dark mode
function getThemedColors(kind: string, isDark: boolean) {
  const colors = kindColors[kind] || defaultColors;
  return {
    bg: isDark ? colors.bgDark : colors.bg,
    border: isDark ? colors.borderDark : colors.border,
    text: isDark ? colors.textDark : colors.text,
  };
}

function getStatus(r: K8sResource): { status: string; color: string; colorDark: string } {
  let status = 'Unknown';
  let color = '#9ca3af';
  let colorDark = '#6b7280';

  if (r.kind === 'Pod') {
    const phase = (r.status as { phase?: string })?.phase || 'Unknown';
    status = phase;
    if (phase === 'Running') { color = '#22c55e'; colorDark = '#4ade80'; }
    else if (phase === 'Pending') { color = '#eab308'; colorDark = '#facc15'; }
    else if (phase === 'Failed') { color = '#ef4444'; colorDark = '#f87171'; }
    else if (phase === 'Succeeded') { color = '#22c55e'; colorDark = '#4ade80'; }
  } else if (r.kind === 'DaemonSet') {
    // DaemonSets use different status fields than Deployments/StatefulSets
    const desired = (r.status as { desiredNumberScheduled?: number })?.desiredNumberScheduled || 0;
    const ready = (r.status as { numberReady?: number })?.numberReady || 0;
    status = `${ready}/${desired}`;
    if (ready === desired && desired > 0) { color = '#22c55e'; colorDark = '#4ade80'; }
    else { color = '#eab308'; colorDark = '#facc15'; }
  } else if (['Deployment', 'StatefulSet'].includes(r.kind)) {
    const replicas = (r.status as { replicas?: number })?.replicas || 0;
    const ready = (r.status as { readyReplicas?: number })?.readyReplicas || 0;
    status = `${ready}/${replicas}`;
    if (ready === replicas && replicas > 0) { color = '#22c55e'; colorDark = '#4ade80'; }
    else { color = '#eab308'; colorDark = '#facc15'; }
  } else if (r.kind === 'Service') {
    status = 'Active';
    color = '#22c55e';
    colorDark = '#4ade80';
  } else if (r.kind === 'Job') {
    const succeeded = (r.status as { succeeded?: number })?.succeeded || 0;
    const failed = (r.status as { failed?: number })?.failed || 0;
    if (succeeded > 0) { status = 'Succeeded'; color = '#22c55e'; colorDark = '#4ade80'; }
    else if (failed > 0) { status = 'Failed'; color = '#ef4444'; colorDark = '#f87171'; }
    else { status = 'Running'; color = '#eab308'; colorDark = '#facc15'; }
  } else if (r.kind === 'PersistentVolumeClaim') {
    status = (r.status as { phase?: string })?.phase || 'Unknown';
    if (status === 'Bound') { color = '#22c55e'; colorDark = '#4ade80'; }
    else { color = '#eab308'; colorDark = '#facc15'; }
  } else if (['ConfigMap', 'Secret', 'Ingress', 'CronJob'].includes(r.kind)) {
    status = 'Active';
    color = '#22c55e';
    colorDark = '#4ade80';
  }

  return { status, color, colorDark };
}

// Layout types
interface LayoutNode {
  uid: string;
  resource: K8sResource;
  x: number;
  y: number;
  width: number;
  height: number;
  childPods?: LayoutNode[];  // For controllers that contain pods
}

interface LayoutEdge {
  from: string;
  to: string;
  type: 'owner' | 'selector' | 'service' | 'ingress' | 'gateway' | 'network-policy';
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
const COMPACT_NODE_SIZE = 48;  // For services and gateways
const POD_WIDTH = 120;
const POD_HEIGHT = 32;
const POD_GAP = 6;
const CONTROLLER_HEADER = 32;
const CONTROLLER_PADDING = 8;
const CONFIG_ICON_SIZE = 20;
const CONFIG_ICON_GAP = 4;
const CONFIG_ICONS_PER_ROW = 5;
const NODE_GAP_X = 32;
const NODE_GAP_Y = 10;
const APP_PADDING = 12;
const APP_TITLE_HEIGHT = 36;
const APP_GAP = 20;

interface ResourceOverviewProps {
  namespace?: string;
}

export function ResourceOverview({ namespace }: ResourceOverviewProps) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [allResources, setAllResources] = useState<K8sResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 40, y: 40, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<LayoutNode | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Detect dark mode (supports both class and media query strategies)
  useEffect(() => {
    const checkDarkMode = () => {
      // Check for class-based dark mode (Tailwind class strategy)
      const hasClass = document.documentElement.classList.contains('dark');
      // Check for media query-based dark mode (Tailwind media strategy)
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setIsDarkMode(hasClass || mediaQuery.matches);
    };
    
    checkDarkMode();
    
    // Watch for changes to the dark mode class
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    
    // Watch for media query changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const mediaListener = () => checkDarkMode();
    mediaQuery.addEventListener('change', mediaListener);
    
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', mediaListener);
    };
  }, []);

  const loadResources = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // If no namespace is selected, fetch from all namespaces
      const namespacePath = namespace ? `/namespaces/${namespace}` : '';
      
      const resourceTypes = [
        { path: `/api/v1${namespacePath}/pods`, kind: 'Pod' },
        { path: `/apis/apps/v1${namespacePath}/deployments`, kind: 'Deployment' },
        { path: `/apis/apps/v1${namespacePath}/replicasets`, kind: 'ReplicaSet' },  // For owner chain traversal
        { path: `/apis/apps/v1${namespacePath}/statefulsets`, kind: 'StatefulSet' },
        { path: `/apis/apps/v1${namespacePath}/daemonsets`, kind: 'DaemonSet' },
        { path: `/api/v1${namespacePath}/services`, kind: 'Service' },
        { path: `/api/v1${namespacePath}/configmaps`, kind: 'ConfigMap' },
        { path: `/api/v1${namespacePath}/secrets`, kind: 'Secret' },
        { path: `/api/v1${namespacePath}/persistentvolumeclaims`, kind: 'PersistentVolumeClaim' },
        { path: `/apis/batch/v1${namespacePath}/jobs`, kind: 'Job' },
        { path: `/apis/batch/v1${namespacePath}/cronjobs`, kind: 'CronJob' },
        { path: `/apis/networking.k8s.io/v1${namespacePath}/ingresses`, kind: 'Ingress' },
        { path: `/apis/networking.k8s.io/v1${namespacePath}/networkpolicies`, kind: 'NetworkPolicy' },
        // Gateway API resources (may not be available on all clusters)
        { path: `/apis/gateway.networking.k8s.io/v1${namespacePath}/gateways`, kind: 'Gateway' },
        { path: `/apis/gateway.networking.k8s.io/v1${namespacePath}/httproutes`, kind: 'HTTPRoute' },
        { path: `/apis/gateway.networking.k8s.io/v1${namespacePath}/grpcroutes`, kind: 'GRPCRoute' },
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

      setAllResources(allResources);
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

  // Handle config icon click (ConfigMap, Secret, PVC)
  const handleConfigClick = useCallback((kind: string, name: string, ns?: string) => {
    const resource = allResources.find(
      r => r.kind === kind && r.metadata.name === name && r.metadata.namespace === ns
    );
    if (resource) {
      // Create a fake LayoutNode for the config resource
      setSelectedNode({
        uid: resource.metadata.uid,
        resource,
        x: 0, y: 0, width: 0, height: 0,
      });
    }
  }, [allResources]);

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
      <div className="flex items-center justify-center h-full bg-white dark:bg-neutral-950">
        <div className="flex items-center gap-2 text-neutral-500">
          <RefreshCw className="animate-spin" size={20} />
          <span>Loading resources...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-white dark:bg-neutral-950">
        <div className="text-red-500">{error}</div>
        <button
          onClick={loadResources}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-md transition-colors"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
    <div className={`h-full w-full relative bg-neutral-100 dark:bg-neutral-900 overflow-hidden transition-all duration-300 ${isDetailPanelOpen ? 'mr-120' : ''}`}>
      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700">
        <button onClick={loadResources} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-l-lg" title="Refresh">
          <RefreshCw size={16} className="text-neutral-600 dark:text-neutral-400" />
        </button>
        <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-700" />
        <button onClick={zoomIn} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700" title="Zoom In">
          <ZoomIn size={16} className="text-neutral-600 dark:text-neutral-400" />
        </button>
        <button onClick={zoomOut} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700" title="Zoom Out">
          <ZoomOut size={16} className="text-neutral-600 dark:text-neutral-400" />
        </button>
        <button onClick={fitView} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700" title="Fit View">
          <Maximize2 size={16} className="text-neutral-600 dark:text-neutral-400" />
        </button>
        <div className="px-2 text-xs text-neutral-500 border-l border-neutral-200 dark:border-neutral-700 rounded-r-lg">
          {Math.round(transform.scale * 100)}%
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-10 px-3 py-2 bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700">
        <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Connections</div>
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#64748b" strokeWidth="2" /></svg>
            <span className="text-neutral-500 dark:text-neutral-400">Owner</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4,2" /></svg>
            <span className="text-neutral-500 dark:text-neutral-400">Selector</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#06b6d4" strokeWidth="2" strokeDasharray="4,2" /></svg>
            <span className="text-neutral-500 dark:text-neutral-400">Service</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#14b8a6" strokeWidth="2" strokeDasharray="4,2" /></svg>
            <span className="text-neutral-500 dark:text-neutral-400">Ingress</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#10b981" strokeWidth="2" strokeDasharray="4,2" /></svg>
            <span className="text-neutral-500 dark:text-neutral-400">Gateway</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2,2" /></svg>
            <span className="text-neutral-500 dark:text-neutral-400">NetworkPolicy</span>
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
            {/* Light mode markers */}
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
            <marker id="arrow-gateway" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
            </marker>
            <marker id="arrow-network-policy" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
            </marker>
            {/* Dark mode markers */}
            <marker id="arrow-owner-dark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
            <marker id="arrow-selector-dark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#c084fc" />
            </marker>
            <marker id="arrow-service-dark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#22d3ee" />
            </marker>
            <marker id="arrow-ingress-dark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2dd4bf" />
            </marker>
            <marker id="arrow-gateway-dark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#34d399" />
            </marker>
            <marker id="arrow-network-policy-dark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
            </marker>
          </defs>
          {applications.map((app) => (
            <ApplicationGroup key={app.id} application={app} onNodeClick={handleNodeClick} onConfigClick={handleConfigClick} isDarkMode={isDarkMode} />
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
function ApplicationGroup({ application, onNodeClick, onConfigClick, isDarkMode }: { 
  application: Application; 
  onNodeClick: (node: LayoutNode) => void;
  onConfigClick: (kind: string, name: string, ns?: string) => void;
  isDarkMode: boolean;
}) {
  // Build node map including nested pods (with calculated absolute positions)
  const nodeMap = useMemo(() => {
    const map = new Map(application.nodes.map((n) => [n.uid, n]));
    // Add nested pods with their absolute positions
    application.nodes.forEach((n) => {
      if (n.childPods) {
        n.childPods.forEach((pod) => {
          map.set(pod.uid, {
            ...pod,
            x: n.x + pod.x,  // Convert to absolute position
            y: n.y + pod.y,
          });
        });
      }
    });
    return map;
  }, [application.nodes]);

  // Get non-pod nodes (pods are rendered inside controllers)
  const standaloneNodes = useMemo(() => 
    application.nodes.filter(n => !n.resource.kind.match(/^Pod$/) || !application.nodes.some(
      parent => ['Deployment', 'StatefulSet', 'DaemonSet', 'Job'].includes(parent.resource.kind) && 
        parent.childPods?.some(p => p.uid === n.uid)
    )),
    [application.nodes]
  );

  // Determine if we should show the title
  const showTitle = application.name && application.name.length > 0;

  return (
    <g>
      {/* Application background */}
      <rect
        x={application.x}
        y={application.y}
        width={application.width}
        height={application.height}
        rx={12}
        fill={isDarkMode ? '#262626' : 'white'}
        stroke={isDarkMode ? '#404040' : '#e5e7eb'}
        strokeWidth={1}
      />
      
      {/* Application title */}
      {showTitle && (
        <g>
          {/* Title text with truncation */}
          <text
            x={application.x + 10}
            y={application.y + 13}
            fontSize={12}
            fontWeight={600}
            fill={isDarkMode ? '#e5e5e5' : '#374151'}
            dominantBaseline="hanging"
          >
            {application.name.length > Math.floor((application.width - 20) / 7) 
              ? application.name.slice(0, Math.floor((application.width - 20) / 7) - 1) + '…' 
              : application.name}
          </text>
          {/* Namespace on second line */}
          {application.namespace && (
            <text
              x={application.x + 10}
              y={application.y + 26}
              fontSize={10}
              fill={isDarkMode ? '#a3a3a3' : '#6b7280'}
              dominantBaseline="hanging"
            >
              {application.namespace.length > Math.floor((application.width - 20) / 6) 
                ? application.namespace.slice(0, Math.floor((application.width - 20) / 6) - 1) + '…' 
                : application.namespace}
            </text>
          )}
        </g>
      )}
      
      {/* Edges - only for non-nested relationships */}
      {application.edges.map((edge, i) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return null;
        // Skip owner edges between controller and its contained pods (but keep service edges)
        if (edge.type === 'owner') {
          const isInternalEdge = from.childPods?.some(p => p.uid === to.uid) || to.childPods?.some(p => p.uid === from.uid);
          if (isInternalEdge) return null;
        }
        return <EdgeLine key={i} from={from} to={to} type={edge.type} isDarkMode={isDarkMode} />;
      })}

      {/* Nodes */}
      {standaloneNodes.map((node) => (
        <ResourceNodeSVG key={node.uid} node={node} onClick={() => onNodeClick(node)} onPodClick={onNodeClick} onConfigClick={onConfigClick} isDarkMode={isDarkMode} />
      ))}
    </g>
  );
}

// Edge component
function EdgeLine({ from, to, type, isDarkMode }: { from: LayoutNode; to: LayoutNode; type: LayoutEdge['type']; isDarkMode: boolean }) {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  
  const midX = (startX + endX) / 2;
  const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
  
  const colors: Record<string, string> = {
    owner: isDarkMode ? '#94a3b8' : '#64748b',
    selector: isDarkMode ? '#c084fc' : '#8b5cf6',
    service: isDarkMode ? '#22d3ee' : '#06b6d4',
    ingress: isDarkMode ? '#2dd4bf' : '#14b8a6',
    gateway: isDarkMode ? '#34d399' : '#10b981',
    'network-policy': isDarkMode ? '#fbbf24' : '#f59e0b',
  };
  
  const dashArrays: Record<string, string | undefined> = {
    owner: undefined,
    selector: '6,3',
    service: '6,3',
    ingress: '4,2',
    gateway: '4,2',
    'network-policy': '2,2',
  };

  return (
    <path
      d={path}
      fill="none"
      stroke={colors[type]}
      strokeWidth={type === 'network-policy' ? 1.5 : 2}
      strokeDasharray={dashArrays[type]}
      markerEnd={`url(#arrow-${type}${isDarkMode ? '-dark' : ''})`}
    />
  );
}

// Resource node component (SVG)
function ResourceNodeSVG({ node, onClick, onPodClick, onConfigClick, isDarkMode }: { 
  node: LayoutNode; 
  onClick: () => void; 
  onPodClick?: (node: LayoutNode) => void;
  onConfigClick?: (kind: string, name: string, ns?: string) => void;
  isDarkMode: boolean;
}) {
  const { resource, x, y, width, height } = node;
  
  // Route to specialized renderers
  if (resource.kind === 'NetworkPolicy') {
    return <NetworkPolicyNodeSVG node={node} onClick={onClick} isDarkMode={isDarkMode} />;
  }
  if (resource.kind === 'Service') {
    return <CompactNodeSVG node={node} onClick={onClick} isDarkMode={isDarkMode} />;
  }
  if (['Gateway', 'HTTPRoute', 'GRPCRoute'].includes(resource.kind)) {
    return <CompactNodeSVG node={node} onClick={onClick} isDarkMode={isDarkMode} />;
  }
  if (resource.kind === 'Ingress') {
    return <IngressNodeSVG node={node} onClick={onClick} isDarkMode={isDarkMode} />;
  }
  
  // Controllers with pods
  if (['Deployment', 'StatefulSet', 'DaemonSet', 'Job'].includes(resource.kind) && node.childPods && node.childPods.length > 0) {
    return <ControllerNodeSVG node={node} onClick={onClick} onPodClick={onPodClick} onConfigClick={onConfigClick} isDarkMode={isDarkMode} />;
  }
  
  const colors = getThemedColors(resource.kind, isDarkMode);
  const Icon = kindIcons[resource.kind] || Hexagon;
  const statusInfo = getStatus(resource);
  const statusColor = isDarkMode ? statusInfo.colorDark : statusInfo.color;
  
  // Truncate name based on width
  const maxNameChars = Math.floor((width - 20) / 6.5);
  const displayName = resource.metadata.name.length > maxNameChars 
    ? resource.metadata.name.slice(0, maxNameChars - 2) + '…' 
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
      
      {/* Kind icon and label */}
      <g transform="translate(10, 10)">
        <foreignObject width={18} height={18}>
          <div style={{ color: colors.text }}><Icon size={16} /></div>
        </foreignObject>
        <text x={22} y={13} fontSize={11} fill={colors.text} fontWeight={600}>
          {resource.kind}
        </text>
      </g>
      
      {/* Status indicator */}
      <circle cx={width - 12} cy={14} r={5} fill={statusColor} />
      
      {/* Resource name */}
      <text
        x={10}
        y={height - 12}
        fontSize={12}
        fontWeight={600}
        fill={isDarkMode ? '#e5e7eb' : '#1f2937'}
      >
        {displayName}
      </text>
    </g>
  );
}

// Compact node for services and gateways (square with icon only)
function CompactNodeSVG({ node, onClick, isDarkMode }: { node: LayoutNode; onClick: () => void; isDarkMode: boolean }) {
  const { resource, x, y, width, height } = node;
  const colors = getThemedColors(resource.kind, isDarkMode);
  const Icon = kindIcons[resource.kind] || Hexagon;

  return (
    <g 
      transform={`translate(${x}, ${y})`} 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ cursor: 'pointer' }}
      className="hover:opacity-80 transition-opacity"
    >
      <rect
        width={width}
        height={height}
        rx={8}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={2}
      />
      
      {/* Centered icon */}
      <g transform={`translate(${width / 2 - 12}, ${height / 2 - 12})`}>
        <foreignObject width={24} height={24}>
          <div style={{ color: colors.text }}><Icon size={22} /></div>
        </foreignObject>
      </g>
    </g>
  );
}

// Controller node that contains pods
function ControllerNodeSVG({ node, onClick, onPodClick, onConfigClick, isDarkMode }: { 
  node: LayoutNode; 
  onClick: () => void; 
  onPodClick?: (node: LayoutNode) => void;
  onConfigClick?: (kind: string, name: string, ns?: string) => void;
  isDarkMode: boolean;
}) {
  const { resource, x, y, width, height, childPods = [] } = node;
  const colors = getThemedColors(resource.kind, isDarkMode);
  const Icon = kindIcons[resource.kind] || Hexagon;
  
  const maxNameChars = Math.floor((width - 60) / 6);
  const displayName = resource.metadata.name.length > maxNameChars 
    ? resource.metadata.name.slice(0, maxNameChars - 2) + '…' 
    : resource.metadata.name;
  
  // Get config resources attached to this controller (stored in metadata)
  const configIcons = (node as LayoutNode & { configIcons?: Array<{ kind: string; name: string }> }).configIcons || [];

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Controller background */}
      <rect
        width={width}
        height={height}
        rx={10}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={2}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        style={{ cursor: 'pointer' }}
        className="hover:opacity-90"
      />
      
      {/* Controller header */}
      <g 
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        style={{ cursor: 'pointer' }}
      >
        <g transform="translate(8, 8)">
          <foreignObject width={18} height={18}>
            <div style={{ color: colors.text }}><Icon size={16} /></div>
          </foreignObject>
          <text x={22} y={13} fontSize={11} fill={colors.text} fontWeight={600}>
            {displayName}
          </text>
        </g>
      </g>
      
      {/* Nested pods */}
      {childPods.map((pod, i) => {
        const podColors = getThemedColors('Pod', isDarkMode);
        const statusInfo = getStatus(pod.resource);
        const statusColor = isDarkMode ? statusInfo.colorDark : statusInfo.color;
        const podX = CONTROLLER_PADDING;
        const podY = CONTROLLER_HEADER + i * (POD_HEIGHT + POD_GAP);
        const podNameChars = Math.floor((POD_WIDTH - 30) / 5.5);
        const podName = pod.resource.metadata.name.length > podNameChars
          ? pod.resource.metadata.name.slice(0, podNameChars - 2) + '…'
          : pod.resource.metadata.name;
        
        return (
          <g
            key={pod.uid}
            transform={`translate(${podX}, ${podY})`}
            onClick={(e) => { e.stopPropagation(); onPodClick?.(pod); }}
            style={{ cursor: 'pointer' }}
            className="hover:opacity-80"
          >
            <rect
              width={POD_WIDTH}
              height={POD_HEIGHT}
              rx={4}
              fill={podColors.bg}
              stroke={podColors.border}
              strokeWidth={1.5}
            />
            <circle cx={12} cy={POD_HEIGHT / 2} r={4} fill={statusColor} />
            <text x={22} y={POD_HEIGHT / 2 + 4} fontSize={10} fill={isDarkMode ? '#e5e7eb' : '#1f2937'} fontWeight={500}>
              {podName}
            </text>
          </g>
        );
      })}
      
      {/* Config icons at bottom (ConfigMaps, Secrets, PVCs) - wrapped to multiple rows */}
      {configIcons.length > 0 && (
        <g transform={`translate(${CONTROLLER_PADDING}, ${height - Math.ceil(configIcons.length / CONFIG_ICONS_PER_ROW) * (CONFIG_ICON_SIZE + CONFIG_ICON_GAP) - CONFIG_ICON_GAP})`}>
          {configIcons.map((config, i) => {
            const ConfigIcon = kindIcons[config.kind];
            const configColors = getThemedColors(config.kind, isDarkMode);
            const row = Math.floor(i / CONFIG_ICONS_PER_ROW);
            const col = i % CONFIG_ICONS_PER_ROW;
            const xOffset = col * (CONFIG_ICON_SIZE + CONFIG_ICON_GAP);
            const yOffset = row * (CONFIG_ICON_SIZE + CONFIG_ICON_GAP);
            
            return (
              <g 
                key={`${config.kind}-${config.name}-${i}`} 
                transform={`translate(${xOffset}, ${yOffset})`}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (onConfigClick) {
                    onConfigClick(config.kind, config.name, resource.metadata.namespace);
                  }
                }}
                style={{ cursor: 'pointer' }}
                className="hover:opacity-80"
              >
                <title>{config.name}</title>
                <rect
                  width={CONFIG_ICON_SIZE}
                  height={CONFIG_ICON_SIZE}
                  rx={3}
                  fill={configColors.bg}
                  stroke={configColors.border}
                  strokeWidth={1}
                />
                <g transform={`translate(${CONFIG_ICON_SIZE / 2 - 6}, ${CONFIG_ICON_SIZE / 2 - 6})`}>
                  <foreignObject width={12} height={12}>
                    <div style={{ color: configColors.text }}><ConfigIcon size={12} /></div>
                  </foreignObject>
                </g>
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
}

// Ingress node with hosts
function IngressNodeSVG({ node, onClick, isDarkMode }: { node: LayoutNode; onClick: () => void; isDarkMode: boolean }) {
  const { resource, x, y, width, height } = node;
  const colors = getThemedColors('Ingress', isDarkMode);
  const Icon = kindIcons['Ingress'];
  
  const spec = resource.spec as { rules?: Array<{ host?: string }> };
  const hosts = spec.rules?.map(r => r.host).filter(Boolean) || [];
  
  const maxNameChars = Math.floor((width - 20) / 6.5);
  const displayName = resource.metadata.name.length > maxNameChars 
    ? resource.metadata.name.slice(0, maxNameChars - 2) + '…' 
    : resource.metadata.name;

  return (
    <g 
      transform={`translate(${x}, ${y})`} 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ cursor: 'pointer' }}
      className="hover:opacity-80 transition-opacity"
    >
      <rect width={width} height={height} rx={8} fill={colors.bg} stroke={colors.border} strokeWidth={2} />
      
      {/* Kind icon and label */}
      <g transform="translate(10, 10)">
        <foreignObject width={18} height={18}>
          <div style={{ color: colors.text }}><Icon size={16} /></div>
        </foreignObject>
        <text x={22} y={13} fontSize={11} fill={colors.text} fontWeight={600}>Ingress</text>
      </g>
      
      {/* Host badge */}
      {hosts.length > 0 && hosts[0] && (
        <text x={width - 10} y={18} fontSize={9} fill={isDarkMode ? '#5eead4' : '#115e59'} textAnchor="end">
          {hosts[0].length > 18 ? hosts[0].slice(0, 16) + '…' : hosts[0]}
        </text>
      )}
      
      {/* Resource name */}
      <text x={10} y={height - 12} fontSize={12} fontWeight={600} fill={isDarkMode ? '#e5e7eb' : '#1f2937'}>
        {displayName}
      </text>
    </g>
  );
}

// NetworkPolicy node with rules summary
function NetworkPolicyNodeSVG({ node, onClick, isDarkMode }: { node: LayoutNode; onClick: () => void; isDarkMode: boolean }) {
  const { resource, x, y, width, height } = node;
  const colors = getThemedColors('NetworkPolicy', isDarkMode);
  const Icon = kindIcons['NetworkPolicy'];
  
  const spec = resource.spec as {
    podSelector?: { matchLabels?: Record<string, string> };
    policyTypes?: string[];
    ingress?: Array<{
      from?: Array<{
        namespaceSelector?: { matchLabels?: Record<string, string> };
        podSelector?: { matchLabels?: Record<string, string> };
        ipBlock?: { cidr: string };
      }>;
      ports?: Array<{ port?: number; protocol?: string }>;
    }>;
    egress?: Array<{
      to?: Array<{
        namespaceSelector?: { matchLabels?: Record<string, string> };
        podSelector?: { matchLabels?: Record<string, string> };
        ipBlock?: { cidr: string };
      }>;
      ports?: Array<{ port?: number; protocol?: string }>;
    }>;
  };
  
  const policyTypes = spec.policyTypes || [];
  const hasIngress = policyTypes.includes('Ingress') || spec.ingress;
  const hasEgress = policyTypes.includes('Egress') || spec.egress;
  const ingressRules = spec.ingress || [];
  const egressRules = spec.egress || [];
  
  // Determine policy effect
  const ingressDeny = hasIngress && ingressRules.length === 0;
  const egressDeny = hasEgress && egressRules.length === 0;
  const isDenyAll = ingressDeny && egressDeny;
  
  const maxNameChars = Math.floor((width - 20) / 6.5);
  const displayName = resource.metadata.name.length > maxNameChars 
    ? resource.metadata.name.slice(0, maxNameChars - 2) + '…' 
    : resource.metadata.name;

  // Build rule summary
  const getSummary = () => {
    const parts: string[] = [];
    if (isDenyAll) return '🔒 Deny All';
    if (ingressDeny) parts.push('⛔ No Ingress');
    else if (hasIngress && ingressRules.length > 0) parts.push(`↓${ingressRules.length}`);
    if (egressDeny) parts.push('⛔ No Egress');
    else if (hasEgress && egressRules.length > 0) parts.push(`↑${egressRules.length}`);
    return parts.join(' ') || '✓ Allow';
  };

  return (
    <g 
      transform={`translate(${x}, ${y})`} 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ cursor: 'pointer' }}
      className="hover:opacity-80 transition-opacity"
    >
      <rect 
        width={width} 
        height={height} 
        rx={8} 
        fill={isDenyAll ? (isDarkMode ? '#7f1d1d' : '#fef2f2') : colors.bg} 
        stroke={isDenyAll ? (isDarkMode ? '#f87171' : '#ef4444') : colors.border} 
        strokeWidth={2} 
      />
      
      {/* Kind icon and label */}
      <g transform="translate(10, 10)">
        <foreignObject width={18} height={18}>
          <div style={{ color: isDenyAll ? (isDarkMode ? '#f87171' : '#ef4444') : colors.text }}><Icon size={16} /></div>
        </foreignObject>
        <text x={22} y={13} fontSize={10} fill={isDenyAll ? (isDarkMode ? '#f87171' : '#ef4444') : colors.text} fontWeight={600}>
          NetworkPolicy
        </text>
      </g>
      
      {/* Rule summary badge */}
      <text x={width - 10} y={18} fontSize={9} fill={isDenyAll ? (isDarkMode ? '#fca5a5' : '#dc2626') : (isDarkMode ? '#fcd34d' : '#92400e')} textAnchor="end" fontWeight={500}>
        {getSummary()}
      </text>
      
      {/* Resource name */}
      <text x={10} y={height - 12} fontSize={12} fontWeight={600} fill={isDarkMode ? '#e5e7eb' : '#1f2937'}>
        {displayName}
      </text>
    </g>
  );
}

// Build layout from resources
// Helper to extract app name from common Kubernetes labels
function extractAppName(resource: K8sResource): string | undefined {
  const labels = resource.metadata.labels || {};
  // Prioritize instance/release labels (often more specific)
  return labels['app.kubernetes.io/instance'] ||
    labels['release'] ||
    // Then app labels
    labels['app'] ||
    labels['app.kubernetes.io/name'] ||
    labels['k8s-app'] ||
    labels['name'] ||
    // Finally, other Kubernetes labels
    labels['app.kubernetes.io/component'] ||
    labels['app.kubernetes.io/part-of'];
}

// Priority order for determining application anchor (controller)
const ANCHOR_PRIORITY: Record<string, number> = {
  'Deployment': 1,
  'StatefulSet': 2,
  'DaemonSet': 3,
  'CronJob': 4,
  'Job': 5,
  'Pod': 6,  // Standalone pods as last resort
};

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

  // Service selectors -> Pods (will be added later after controller mapping)

  // Controller selectors -> Pods (for connection tracking, not owner)
  const controllerKinds = ['Deployment', 'StatefulSet', 'DaemonSet', 'Job'];
  resources.forEach((r) => {
    if (!controllerKinds.includes(r.kind)) return;
    const matchLabels = (r.spec as { selector?: { matchLabels?: Record<string, string> } })?.selector?.matchLabels;
    if (!matchLabels || Object.keys(matchLabels).length === 0) return;
    
    resources.filter((p) => p.kind === 'Pod' && p.metadata.namespace === r.metadata.namespace).forEach((pod) => {
      const labels = pod.metadata.labels || {};
      if (Object.entries(matchLabels).every(([k, v]) => labels[k] === v)) {
        addConnection(r.metadata.uid, pod.metadata.uid);
        // Don't add edge here - pods will be nested inside controller
      }
    });
  });
  
  // Build controller -> pods mapping (pods that will be nested)
  // A pod belongs to a controller if it's owned by that controller OR owned by a ReplicaSet owned by that controller
  const controllerToPods = new Map<string, K8sResource[]>();
  const podToController = new Map<string, string>();
  
  // Track static pods (owned by Node) to filter them out
  const staticPodUids = new Set<string>();
  
  resources.filter(r => r.kind === 'Pod').forEach((pod) => {
    // Check direct owner
    const ownerRef = pod.metadata.ownerReferences?.[0];
    if (!ownerRef) return;
    
    // Static pods are owned by Node - mark them for filtering
    if (ownerRef.kind === 'Node') {
      staticPodUids.add(pod.metadata.uid);
      return;
    }
    
    const owner = uidToResource.get(ownerRef.uid);
    if (!owner) return;
    
    // If owner is a controller (Deployment/StatefulSet/DaemonSet/Job), use it directly
    if (controllerKinds.includes(owner.kind)) {
      if (!controllerToPods.has(owner.metadata.uid)) controllerToPods.set(owner.metadata.uid, []);
      controllerToPods.get(owner.metadata.uid)!.push(pod);
      podToController.set(pod.metadata.uid, owner.metadata.uid);
      return;
    }
    
    // If owner is ReplicaSet, look for its Deployment owner
    if (owner.kind === 'ReplicaSet') {
      const rsOwnerRef = owner.metadata.ownerReferences?.[0];
      if (rsOwnerRef) {
        const deployment = uidToResource.get(rsOwnerRef.uid);
        if (deployment && deployment.kind === 'Deployment') {
          if (!controllerToPods.has(deployment.metadata.uid)) controllerToPods.set(deployment.metadata.uid, []);
          controllerToPods.get(deployment.metadata.uid)!.push(pod);
          podToController.set(pod.metadata.uid, deployment.metadata.uid);
        }
      }
    }
  });
  
  // Sort pods within each controller by name
  controllerToPods.forEach((pods) => {
    pods.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  });
  
  // Service -> Pod edges (point from service to individual pods)
  resources.forEach((r) => {
    if (r.kind !== 'Service') return;
    const selector = (r.spec as { selector?: Record<string, string> })?.selector;
    if (!selector || Object.keys(selector).length === 0) return;
    
    resources.filter((p) => p.kind === 'Pod' && p.metadata.namespace === r.metadata.namespace).forEach((pod) => {
      const labels = pod.metadata.labels || {};
      if (Object.entries(selector).every(([k, v]) => labels[k] === v)) {
        // Service connects to individual pod
        addConnection(r.metadata.uid, pod.metadata.uid);
        addEdge(r.metadata.uid, pod.metadata.uid, 'service');
      }
    });
  });
  
  // Update NetworkPolicy -> Pod edges to point to controller instead when pods are nested
  resources.forEach((r) => {
    if (r.kind !== 'NetworkPolicy') return;
    const spec = r.spec as {
      podSelector?: { matchLabels?: Record<string, string> };
    };
    const ns = r.metadata.namespace || '';
    const matchLabels = spec.podSelector?.matchLabels || {};
    const matchesAllPods = Object.keys(matchLabels).length === 0;
    
    resources.filter((p) => p.kind === 'Pod' && p.metadata.namespace === ns).forEach((pod) => {
      const labels = pod.metadata.labels || {};
      const matches = matchesAllPods || Object.entries(matchLabels).every(([k, v]) => labels[k] === v);
      if (matches) {
        const controllerId = podToController.get(pod.metadata.uid);
        if (controllerId) {
          addEdge(controllerId, r.metadata.uid, 'network-policy');
        } else {
          addEdge(pod.metadata.uid, r.metadata.uid, 'network-policy');
        }
      }
    });
  });

  // Build lookup map for Services by namespace/name
  const servicesByKey = new Map<string, K8sResource>();
  resources.forEach((r) => {
    if (r.kind === 'Service') {
      const key = `${r.metadata.namespace || ''}/${r.metadata.name}`;
      servicesByKey.set(key, r);
    }
  });

  // Ingress -> Service connections
  resources.forEach((r) => {
    if (r.kind !== 'Ingress') return;
    const spec = r.spec as {
      defaultBackend?: { service?: { name: string } };
      rules?: Array<{
        http?: {
          paths?: Array<{
            backend?: { service?: { name: string } };
          }>;
        };
      }>;
    };
    const ns = r.metadata.namespace || '';
    
    // Check default backend
    if (spec.defaultBackend?.service?.name) {
      const svc = servicesByKey.get(`${ns}/${spec.defaultBackend.service.name}`);
      if (svc) {
        addConnection(r.metadata.uid, svc.metadata.uid);
        addEdge(r.metadata.uid, svc.metadata.uid, 'ingress');
      }
    }
    
    // Check rules
    spec.rules?.forEach((rule) => {
      rule.http?.paths?.forEach((path) => {
        if (path.backend?.service?.name) {
          const svc = servicesByKey.get(`${ns}/${path.backend.service.name}`);
          if (svc) {
            addConnection(r.metadata.uid, svc.metadata.uid);
            addEdge(r.metadata.uid, svc.metadata.uid, 'ingress');
          }
        }
      });
    });
  });

  // HTTPRoute/GRPCRoute -> Service connections (Gateway API)
  resources.forEach((r) => {
    if (r.kind !== 'HTTPRoute' && r.kind !== 'GRPCRoute') return;
    const spec = r.spec as {
      parentRefs?: Array<{ name: string; kind?: string }>;
      rules?: Array<{
        backendRefs?: Array<{ name: string; kind?: string }>;
      }>;
    };
    const ns = r.metadata.namespace || '';
    
    // Connect to parent Gateways
    spec.parentRefs?.forEach((ref) => {
      if (!ref.kind || ref.kind === 'Gateway') {
        const gateway = resources.find(
          (g) => g.kind === 'Gateway' && g.metadata.name === ref.name && g.metadata.namespace === ns
        );
        if (gateway) {
          addConnection(gateway.metadata.uid, r.metadata.uid);
          addEdge(gateway.metadata.uid, r.metadata.uid, 'gateway');
        }
      }
    });
    
    // Connect to backend Services
    spec.rules?.forEach((rule) => {
      rule.backendRefs?.forEach((ref) => {
        if (!ref.kind || ref.kind === 'Service') {
          const svc = servicesByKey.get(`${ns}/${ref.name}`);
          if (svc) {
            addConnection(r.metadata.uid, svc.metadata.uid);
            addEdge(r.metadata.uid, svc.metadata.uid, 'gateway');
          }
        }
      });
    });
  });

  // Build layout from connected components
  // Note: NetworkPolicy -> Pod connections are already handled above

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

  // Build controller -> config resources mapping (after extractContainerRefs is defined)
  const controllerToConfigs = new Map<string, Map<string, Set<string>>>();  // controllerId -> kind -> set of resource names
  
  resources.filter(r => r.kind === 'Pod').forEach((pod) => {
    const controllerId = podToController.get(pod.metadata.uid);
    if (!controllerId) return;
    
    const spec = pod.spec as {
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
    
    if (!controllerToConfigs.has(controllerId)) {
      controllerToConfigs.set(controllerId, new Map());
    }
    const configMap = controllerToConfigs.get(controllerId)!;
    
    if (referencedConfigMaps.size > 0) {
      if (!configMap.has('ConfigMap')) configMap.set('ConfigMap', new Set());
      referencedConfigMaps.forEach(name => configMap.get('ConfigMap')!.add(name));
    }
    if (referencedSecrets.size > 0) {
      if (!configMap.has('Secret')) configMap.set('Secret', new Set());
      referencedSecrets.forEach(name => configMap.get('Secret')!.add(name));
    }
    if (referencedPVCs.size > 0) {
      if (!configMap.has('PersistentVolumeClaim')) configMap.set('PersistentVolumeClaim', new Set());
      referencedPVCs.forEach(name => configMap.get('PersistentVolumeClaim')!.add(name));
    }
  });

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

  // Find connected components (excluding static pods)
  const visited = new Set<string>();
  const components: string[][] = [];
  
  function dfs(uid: string, component: string[]) {
    if (visited.has(uid)) return;
    // Skip static pods
    if (staticPodUids.has(uid)) return;
    visited.add(uid);
    component.push(uid);
    (connections.get(uid) || new Set()).forEach((n) => dfs(n, component));
  }
  
  resources.forEach((r) => {
    // Skip static pods
    if (staticPodUids.has(r.metadata.uid)) return;
    if (!visited.has(r.metadata.uid)) {
      const component: string[] = [];
      dfs(r.metadata.uid, component);
      if (component.length > 0) components.push(component);
    }
  });

  // Sort components by size (largest first)
  components.sort((a, b) => b.length - a.length);

  // Build applications with swim-lane layout
  const applications: Application[] = [];
  
  // Define swim lanes (left to right flow)
  // Lane 0: Ingress/Gateway (traffic entry points)
  // Lane 1: HTTPRoute/GRPCRoute (routing)
  // Lane 2: Service (load balancing)
  // Lane 3: Controller (Deployment/StatefulSet/DaemonSet/Job) - contains pods
  // Lane 4: Config (ConfigMap/Secret/PVC)
  // Lane 5: NetworkPolicy (security)
  const kindToLane: Record<string, number> = {
    'Gateway': 0,
    'Ingress': 0,
    'HTTPRoute': 1,
    'GRPCRoute': 1,
    'Service': 2,
    'Deployment': 3,
    'StatefulSet': 3,
    'DaemonSet': 3,
    'Job': 3,
    'CronJob': 3,
    'Pod': 3,  // Standalone pods go in controller lane
    'ConfigMap': 4,
    'Secret': 4,
    'PersistentVolumeClaim': 4,
    'NetworkPolicy': 5,
  };

  components.forEach((component, idx) => {
    const componentResources = component.map((uid) => uidToResource.get(uid)!).filter(Boolean);
    if (componentResources.length === 0) return;
    
    // Filter out pods that are nested in controllers, ReplicaSets, and config resources
    const standaloneResources = componentResources.filter(r => {
      // Skip ReplicaSets entirely
      if (r.kind === 'ReplicaSet') return false;
      // Skip pods that are nested in a controller
      if (r.kind === 'Pod' && podToController.has(r.metadata.uid)) return false;
      // Skip config resources (they're shown as icons on controllers)
      if (['ConfigMap', 'Secret', 'PersistentVolumeClaim'].includes(r.kind)) return false;
      return true;
    });
    
    if (standaloneResources.length === 0) return;
    
    // Group resources by lane
    const lanes = new Map<number, string[]>();
    standaloneResources.forEach((r) => {
      const lane = kindToLane[r.kind] ?? 3; // Default to controller lane
      if (!lanes.has(lane)) lanes.set(lane, []);
      lanes.get(lane)!.push(r.metadata.uid);
    });
    
    // Sort within each lane by name for consistency
    lanes.forEach((uids) => {
      uids.sort((a, b) => {
        const ra = uidToResource.get(a)!;
        const rb = uidToResource.get(b)!;
        return ra.metadata.name.localeCompare(rb.metadata.name);
      });
    });
    
    // Calculate node sizes - controllers with pods need larger sizes, services/gateways are compact
    const nodeSizes = new Map<string, { width: number; height: number }>();
    standaloneResources.forEach((r) => {
      // Compact nodes for services and gateway resources
      if (['Service', 'Gateway', 'HTTPRoute', 'GRPCRoute'].includes(r.kind)) {
        nodeSizes.set(r.metadata.uid, { width: COMPACT_NODE_SIZE, height: COMPACT_NODE_SIZE });
        return;
      }
      
      const pods = controllerToPods.get(r.metadata.uid);
      if (pods && pods.length > 0) {
        // Controller with nested pods
        const configsByKind = controllerToConfigs.get(r.metadata.uid);
        // Count total individual config resources
        let numConfigs = 0;
        if (configsByKind) {
          configsByKind.forEach(names => numConfigs += names.size);
        }
        const minWidth = POD_WIDTH + CONTROLLER_PADDING * 2;
        // Calculate config icons with wrapping
        const iconsPerRow = Math.min(numConfigs, CONFIG_ICONS_PER_ROW);
        const configIconsWidth = iconsPerRow > 0 ? iconsPerRow * (CONFIG_ICON_SIZE + CONFIG_ICON_GAP) - CONFIG_ICON_GAP + CONTROLLER_PADDING * 2 : 0;
        const width = Math.max(minWidth, configIconsWidth);
        const numConfigRows = numConfigs > 0 ? Math.ceil(numConfigs / CONFIG_ICONS_PER_ROW) : 0;
        const configIconsHeight = numConfigRows > 0 ? numConfigRows * (CONFIG_ICON_SIZE + CONFIG_ICON_GAP) + CONFIG_ICON_GAP : 0;
        const height = CONTROLLER_HEADER + pods.length * (POD_HEIGHT + POD_GAP) - POD_GAP + CONTROLLER_PADDING + configIconsHeight;
        nodeSizes.set(r.metadata.uid, { width, height });
      } else {
        nodeSizes.set(r.metadata.uid, { width: NODE_WIDTH, height: NODE_HEIGHT });
      }
    });
    
    // Position nodes in lanes
    const nodePositions = new Map<string, { x: number; y: number }>();
    let maxX = 0;
    // Leave space for the title bar
    let maxY = APP_PADDING + APP_TITLE_HEIGHT;
    
    // Get sorted lane numbers that exist in this component
    const activeLanes = Array.from(lanes.keys()).sort((a, b) => a - b);
    
    // Calculate max width per lane (for alignment)
    const laneMaxWidth = new Map<number, number>();
    activeLanes.forEach((lane) => {
      const maxWidth = Math.max(...(lanes.get(lane) || []).map(uid => nodeSizes.get(uid)?.width || NODE_WIDTH));
      laneMaxWidth.set(lane, maxWidth);
    });
    
    // Calculate positions - each lane is a column
    let currentX = APP_PADDING;
    activeLanes.forEach((lane) => {
      const laneWidth = laneMaxWidth.get(lane) || NODE_WIDTH;
      // Start below the title bar
      let y = APP_PADDING + APP_TITLE_HEIGHT;
      
      lanes.get(lane)!.forEach((uid) => {
        const size = nodeSizes.get(uid) || { width: NODE_WIDTH, height: NODE_HEIGHT };
        // Center smaller nodes within the lane
        const xOffset = (laneWidth - size.width) / 2;
        nodePositions.set(uid, { x: currentX + xOffset, y });
        maxY = Math.max(maxY, y + size.height);
        y += size.height + NODE_GAP_Y;
      });
      
      maxX = Math.max(maxX, currentX + laneWidth);
      currentX += laneWidth + NODE_GAP_X;
    });

    const appWidth = maxX + APP_PADDING;
    const appHeight = maxY + APP_PADDING;

    const appNodes: LayoutNode[] = standaloneResources.map((r) => {
      const pos = nodePositions.get(r.metadata.uid)!;
      const size = nodeSizes.get(r.metadata.uid) || { width: NODE_WIDTH, height: NODE_HEIGHT };
      const pods = controllerToPods.get(r.metadata.uid);
      
      // Create child pod nodes
      const childPods: LayoutNode[] | undefined = pods?.map((pod, i) => ({
        uid: pod.metadata.uid,
        resource: pod,
        x: CONTROLLER_PADDING,
        y: CONTROLLER_HEADER + i * (POD_HEIGHT + POD_GAP),
        width: POD_WIDTH,
        height: POD_HEIGHT,
      }));
      
      // Get config icons for this controller - one icon per distinct resource
      const configsByKind = controllerToConfigs.get(r.metadata.uid);
      const configIcons: Array<{ kind: string; name: string }> = [];
      if (configsByKind) {
        configsByKind.forEach((names, kind) => {
          names.forEach(name => configIcons.push({ kind, name }));
        });
      }
      
      return {
        uid: r.metadata.uid,
        resource: r,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        childPods,
        configIcons,  // Add config metadata
      } as LayoutNode & { configIcons?: Array<{ kind: string; name: string }> };
    });

    const appEdges: LayoutEdge[] = [];
    const processedEdges = new Set<string>();
    
    // Build set of nested pod UIDs for this component
    const nestedPodUids = new Set<string>();
    standaloneResources.forEach(r => {
      const pods = controllerToPods.get(r.metadata.uid);
      if (pods) pods.forEach(p => nestedPodUids.add(p.metadata.uid));
    });
    
    edges.forEach((edgeList) => {
      edgeList.forEach((edge) => {
        // Check if both ends are relevant to this component
        const fromStandalone = standaloneResources.some(r => r.metadata.uid === edge.from);
        const toStandalone = standaloneResources.some(r => r.metadata.uid === edge.to);
        const toNestedPod = nestedPodUids.has(edge.to);
        const fromNestedPod = nestedPodUids.has(edge.from);
        
        // Include edge if: both standalone, or one is standalone and other is nested pod
        if ((fromStandalone && toStandalone) || (fromStandalone && toNestedPod) || (toStandalone && fromNestedPod)) {
          const edgeKey = `${edge.from}-${edge.to}-${edge.type}`;
          if (!processedEdges.has(edgeKey)) {
            processedEdges.add(edgeKey);
            appEdges.push(edge);
          }
        }
      });
    });

    // Find the anchor resource (controller) for naming the application
    // Priority: Deployment > StatefulSet > DaemonSet > CronJob > Job > Pod
    let anchorResource: K8sResource | undefined;
    let anchorPriority = Infinity;
    
    standaloneResources.forEach((r) => {
      const priority = ANCHOR_PRIORITY[r.kind];
      if (priority !== undefined && priority < anchorPriority) {
        anchorPriority = priority;
        anchorResource = r;
      }
    });
    
    // Extract application name from anchor's labels
    const appName = anchorResource ? (extractAppName(anchorResource) || anchorResource.metadata.name) : undefined;
    const appNamespace = anchorResource?.metadata.namespace;

    applications.push({
      id: `app-${idx}`,
      name: appName || '',
      namespace: appNamespace,
      nodes: appNodes,
      edges: appEdges,
      x: 0,
      y: 0,
      width: appWidth,
      height: appHeight,
    });
  });

  // Group applications by app name + namespace (same app name in same namespace = same group)
  const appsByKey = new Map<string, Application[]>();
  applications.forEach((app) => {
    const ns = app.namespace || '';
    const name = app.name || '';
    const key = `${ns}/${name}`;
    if (!appsByKey.has(key)) appsByKey.set(key, []);
    appsByKey.get(key)!.push(app);
  });

  // Merge applications with the same app name in the same namespace
  const mergedApplications: Application[] = [];
  
  appsByKey.forEach((groupApps, key) => {
    if (groupApps.length === 1) {
      // Single app in group, use as-is
      mergedApplications.push(groupApps[0]);
    } else {
      // Multiple apps with same name in namespace - combine them
      // Sort by resource name for consistent ordering
      groupApps.sort((a, b) => {
        const aFirstNode = a.nodes[0]?.resource.metadata.name || '';
        const bFirstNode = b.nodes[0]?.resource.metadata.name || '';
        return aFirstNode.localeCompare(bFirstNode);
      });
      
      // Layout apps horizontally within the merged group
      const mergedNodes: LayoutNode[] = [];
      const mergedEdges: LayoutEdge[] = [];
      let offsetX = APP_PADDING;
      let maxHeight = 0;
      
      groupApps.forEach((app) => {
        // Offset all nodes by current position
        app.nodes.forEach((node) => {
          mergedNodes.push({
            ...node,
            x: node.x + offsetX - APP_PADDING,
            y: node.y,
          });
        });
        mergedEdges.push(...app.edges);
        
        offsetX += app.width + APP_GAP;
        maxHeight = Math.max(maxHeight, app.height);
      });
      
      // Extract namespace and name from key
      const [ns, name] = key.split('/');
      
      // Create merged application
      mergedApplications.push({
        id: `app-${key}`,
        name: name,
        namespace: ns,
        nodes: mergedNodes,
        edges: mergedEdges,
        x: 0,
        y: 0,
        width: offsetX - APP_GAP + APP_PADDING,
        height: maxHeight,
      });
    }
  });

  // Arrange applications using row-based layout
  // Sort by height (tallest first) for better packing
  mergedApplications.sort((a, b) => b.height - a.height);
  
  const MAX_ROW_WIDTH = 1800;
  let currentX = 0;
  let rowApps: { app: Application; tempX: number }[] = [];
  
  const rows: { app: Application; tempX: number }[][] = [];
  
  mergedApplications.forEach((app) => {
    // Check if app fits in current row
    if (currentX + app.width > MAX_ROW_WIDTH && rowApps.length > 0) {
      // Start new row
      rows.push([...rowApps]);
      currentX = 0;
      rowApps = [];
    }
    
    rowApps.push({ app, tempX: currentX });
    currentX += app.width + APP_GAP;
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

  return mergedApplications;
}

export default ResourceOverview;