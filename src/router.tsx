import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  redirect,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { z } from 'zod';
import { getConfig } from './config';
import { queryClient } from './queryClient';
import { ClusterLayout } from './components/kubernetes/ClusterLayout';
import { DockerLayout } from './components/docker/DockerLayout';
import { WelcomePage } from './components/WelcomePage';

// Search params schema for cluster routes
const clusterSearchSchema = z.object({
  namespace: z.string().optional(),
  panel: z.enum(['ai']).optional(),
  tab: z.enum(['overview', 'metadata', 'yaml', 'events', 'logs', 'terminal']).optional(),
});

// Search params schema for docker routes  
const dockerSearchSchema = z.object({
  panel: z.enum(['ai']).optional(),
});

export type ClusterSearch = z.infer<typeof clusterSearchSchema>;
export type DockerSearch = z.infer<typeof dockerSearchSchema>;

// Root layout - wraps with providers
const rootRoute = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  ),
});

// Welcome page (root) - shows logo and quick access to contexts
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: WelcomePage,
});

// Cluster (Kubernetes) routes
const clusterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'cluster/$context',
  validateSearch: clusterSearchSchema,
  component: ClusterLayout,
  beforeLoad: ({ params }) => {
    const config = getConfig();
    const contexts = config.kubernetes?.contexts || [];
    if (!contexts.includes(params.context)) {
      throw redirect({ to: '/' });
    }
  },
});

const clusterIndexRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/',
});

const clusterResourceRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '$resourceType',
});

const clusterResourceDetailRoute = createRoute({
  getParentRoute: () => clusterResourceRoute,
  path: '$name',
});

// Docker routes
const dockerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'docker/$context',
  validateSearch: dockerSearchSchema,
  component: DockerLayout,
  beforeLoad: ({ params }) => {
    const config = getConfig();
    const contexts = config.docker?.contexts || [];
    if (!contexts.includes(params.context)) {
      throw redirect({ to: '/' });
    }
  },
});

const dockerIndexRoute = createRoute({
  getParentRoute: () => dockerRoute,
  path: '/',
});

const dockerResourceRoute = createRoute({
  getParentRoute: () => dockerRoute,
  path: '$resourceType',
});

const dockerResourceDetailRoute = createRoute({
  getParentRoute: () => dockerResourceRoute,
  path: '$name',
});

// Route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  clusterRoute.addChildren([
    clusterIndexRoute,
    clusterResourceRoute.addChildren([
      clusterResourceDetailRoute,
    ]),
  ]),
  dockerRoute.addChildren([
    dockerIndexRoute,
    dockerResourceRoute.addChildren([
      dockerResourceDetailRoute,
    ]),
  ]),
]);

// Create router
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

// Type registration for type-safe navigation
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Re-export hooks for convenience
export { useNavigate, useParams, useSearch };

// Route exports for component use
export {
  clusterRoute,
  clusterIndexRoute,
  clusterResourceRoute,
  clusterResourceDetailRoute,
  dockerRoute,
  dockerIndexRoute,
  dockerResourceRoute,
  dockerResourceDetailRoute,
};
