import { useContext } from 'react';
import { Context, type ContextValue } from '../context/context';

export function useContext_(): ContextValue {
  const context = useContext(Context);
  if (!context) {
    throw new Error('useContext_ must be used within a ContextProvider');
  }
  return context;
}

// Convenience hooks for specific parts of the context

export function useMode() {
  const { mode, setMode } = useContext_();
  return { mode, setMode };
}

export function useKubernetes() {
  const {
    kubernetesContext,
    kubernetesContexts,
    kubernetesNamespace,
    kubernetesNamespaces,
    kubernetesResource,
    setKubernetesContext,
    setKubernetesNamespace,
    setKubernetesResource,
    kubernetesApi,
  } = useContext_();
  
  return {
    context: kubernetesContext,
    contexts: kubernetesContexts,
    namespace: kubernetesNamespace,
    namespaces: kubernetesNamespaces,
    resource: kubernetesResource,
    setContext: setKubernetesContext,
    setNamespace: setKubernetesNamespace,
    setResource: setKubernetesResource,
    api: kubernetesApi,
  };
}

export function useDocker() {
  const { dockerContext, dockerContexts, setDockerContext } = useContext_();
  return {
    context: dockerContext,
    contexts: dockerContexts,
    setContext: setDockerContext,
  };
}
