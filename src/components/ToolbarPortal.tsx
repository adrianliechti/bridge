import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Portal wrapper that safely checks ref availability and renders children
 * into the target container element when available.
 */
export function ToolbarPortal({ 
  toolbarRef, 
  children 
}: { 
  toolbarRef: React.RefObject<HTMLDivElement | null>; 
  children: React.ReactNode;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  
  useEffect(() => {
    setContainer(toolbarRef.current);
  }, [toolbarRef]);
  
  return container ? createPortal(children, container) : null;
}
