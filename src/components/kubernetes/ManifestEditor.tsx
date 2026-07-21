import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';
import { Loader2, AlertCircle, X, Save, RotateCcw } from 'lucide-react';
import { stringify as toYaml, parse as parseYaml } from 'yaml';
import type { KubernetesResource } from '../../api/kubernetes/kubernetes';
import type { editor } from 'monaco-editor';
import { ToolbarPortal } from '../ToolbarPortal';

interface ManifestEditorProps {
  resource: KubernetesResource | null;
  loading: boolean;
  error: string | null;
  onSave: (resource: KubernetesResource) => Promise<void>;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
}

// Detect if dark mode is enabled
function isDarkMode(): boolean {
  return (
    document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function ManifestEditor({
  resource,
  loading,
  error,
  onSave,
  toolbarRef,
}: ManifestEditorProps) {
  const [value, setValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dark, setDark] = useState(isDarkMode);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [editorMounted, setEditorMounted] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  // Which resource identity the editor is initialised for, plus the pristine
  // YAML baseline "Reset" returns to. Distinguishes "user opened a different
  // resource" (full re-init, fold sections, reset cursor) from "background
  // refetch of the same resource" (silently update, preserve cursor/folds).
  const [tracked, setTracked] = useState<{ identity: string | null; baseline: string }>({
    identity: null,
    baseline: '',
  });

  // Update dark mode when it changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(isDarkMode());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setDark(isDarkMode());
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Collapse noisy sections in the editor
  const collapseNoisySections = useCallback(
    async (editorInstance: editor.IStandaloneCodeEditor) => {
      const model = editorInstance.getModel();
      if (!model) return setEditorReady(true);

      const lines = model.getValue().split('\n');
      const fieldRegex =
        /^(\s*)(managedFields|ownerReferences|kubectl\.kubernetes\.io\/last-applied-configuration):/;

      // Find all ranges to collapse
      const ranges = lines.flatMap((line, i) => {
        const match = line.match(fieldRegex);
        if (!match) return [];

        const indent = match[1].length;
        const endIdx = lines
          .slice(i + 1)
          .findIndex((l) => l.trimStart().length > 0 && l.length - l.trimStart().length <= indent);
        const endLine = endIdx === -1 ? lines.length : i + 1 + endIdx;

        return endLine > i + 1 ? [{ start: i + 1, end: endLine }] : [];
      });

      // Collapse ranges in reverse order
      for (const { start, end } of ranges.reverse()) {
        editorInstance.setSelection({
          startLineNumber: start,
          startColumn: 1,
          endLineNumber: end,
          endColumn: 1,
        });
        await editorInstance.getAction('editor.fold')?.run();
      }
      editorInstance.setPosition({ lineNumber: 1, column: 1 });
      editorInstance.revealLine(1);
      setEditorReady(true);
    },
    [],
  );

  // Serialize the resource once per object identity.
  const identity = resource
    ? `${resource.apiVersion ?? ''}/${resource.kind ?? ''}/${resource.metadata?.namespace ?? ''}/${resource.metadata?.name ?? ''}`
    : null;
  const yaml = useMemo(() => (resource ? toYaml(resource, { lineWidth: 0 }) : ''), [resource]);

  const isDirty = value !== tracked.baseline;

  // Sync editor content with the incoming resource via state adjustment
  // during render (not an effect).
  if (resource && tracked.identity !== identity) {
    // Different resource (or first load): reset everything. The fold/cursor
    // re-init is scheduled by the collapse effect below.
    setTracked({ identity, baseline: yaml });
    setValue(yaml);
    setSaveError(null);
    if (editorMounted) setEditorReady(false);
  } else if (resource && yaml !== tracked.baseline && !isDirty) {
    // Same resource — background refetch. Silent in-place update: preserve
    // cursor, scroll, and fold state. If the user has local edits, keep both
    // their edits and their original baseline so "Reset" still returns to the
    // version they started from; stale server state surfaces as a save conflict.
    setTracked({ identity, baseline: yaml });
    setValue(yaml);
    setSaveError(null);
  }

  // YAML validity is derived from the current editor content.
  const parseError = useMemo(() => {
    if (!value) return null;
    try {
      parseYaml(value);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid YAML';
    }
  }, [value]);

  // Collapse noisy sections (and reset the cursor) whenever the editor shows
  // a different resource — including the very first mount.
  const collapsedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editorMounted) return;
    const editorInstance = editorRef.current;
    if (!editorInstance) return;
    if (collapsedForRef.current === tracked.identity) return;
    collapsedForRef.current = tracked.identity;
    const timer = setTimeout(() => collapseNoisySections(editorInstance), 100);
    return () => clearTimeout(timer);
  }, [editorMounted, tracked.identity, collapseNoisySections]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure YAML language
    monaco.languages.registerDocumentFormattingEditProvider('yaml', {
      provideDocumentFormattingEdits: (model: editor.ITextModel) => {
        try {
          const text = model.getValue();
          const parsed = parseYaml(text);
          const formatted = toYaml(parsed, { lineWidth: 0 });
          return [
            {
              range: model.getFullModelRange(),
              text: formatted,
            },
          ];
        } catch {
          return [];
        }
      },
    });

    // The collapse effect schedules the initial fold pass once mounted.
    setEditorReady(false);
    setEditorMounted(true);
  };

  const handleChange = (newValue: string | undefined) => {
    setValue(newValue || '');
    setSaveError(null);
  };

  const handleReset = useCallback(() => {
    setValue(tracked.baseline);
    setSaveError(null);
  }, [tracked.baseline]);

  const handleSave = useCallback(async () => {
    if (parseError || !isDirty) return;

    try {
      setSaving(true);
      setSaveError(null);
      const parsed = parseYaml(value) as KubernetesResource;
      await onSave(parsed);
      setTracked((prev) => ({ ...prev, baseline: value }));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [parseError, isDirty, value, onSave]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Loading resource...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-neutral-500 dark:text-neutral-400">No resource loaded</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar actions rendered via portal to parent */}
      {toolbarRef && (
        <ToolbarPortal toolbarRef={toolbarRef}>
          <button
            onClick={handleSave}
            disabled={!isDirty || !!parseError || saving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save changes"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          </button>
          <button
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Reset changes"
          >
            <RotateCcw size={12} />
          </button>
        </ToolbarPortal>
      )}

      {/* Status bar */}
      {(parseError || saveError) && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20">
          {parseError ? (
            <>
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <span className="text-xs text-red-700 dark:text-red-400">
                Invalid YAML: {parseError}
              </span>
            </>
          ) : (
            <>
              <X size={14} className="text-red-500 shrink-0" />
              <span className="text-xs text-red-700 dark:text-red-400">{saveError}</span>
            </>
          )}
        </div>
      )}

      {/* Editor */}
      <div
        className={`flex-1 min-h-0 transition-opacity duration-150 ${editorReady ? 'opacity-100' : 'opacity-0'}`}
      >
        <Editor
          height="100%"
          language="yaml"
          theme={dark ? 'vs-dark' : 'light'}
          value={value}
          onChange={handleChange}
          onMount={handleEditorMount}
          loading={
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="animate-spin text-neutral-400" />
            </div>
          }
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            wrappingIndent: 'indent',
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            guides: {
              indentation: true,
              bracketPairs: true,
            },
            padding: { top: 12, bottom: 12 },
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
          }}
        />
      </div>
    </div>
  );
}
