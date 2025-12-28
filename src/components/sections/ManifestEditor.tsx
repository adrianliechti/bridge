import { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { stringify as toYaml, parse as parseYaml } from 'yaml';
import type { KubernetesResource } from '../../api/kubernetes';
import type { editor } from 'monaco-editor';

// Editor state exposed to parent component
export interface ManifestEditorState {
  isDirty: boolean;
  hasError: boolean;
  isSaving: boolean;
  save: () => Promise<void>;
  reset: () => void;
}

interface ManifestEditorProps {
  resource: KubernetesResource | null;
  loading: boolean;
  error: string | null;
  onSave: (resource: KubernetesResource) => Promise<void>;
  onStateRef?: (state: ManifestEditorState | null) => void;
}

// Detect if dark mode is enabled
function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ManifestEditor({ resource, loading, error, onSave, onStateRef }: ManifestEditorProps) {
  const [value, setValue] = useState<string>('');
  const [originalValue, setOriginalValue] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dark, setDark] = useState(isDarkMode);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [editorReady, setEditorReady] = useState(false);

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
  const collapseNoisySections = useCallback(async (editorInstance: editor.IStandaloneCodeEditor) => {
    const model = editorInstance.getModel();
    if (!model) return setEditorReady(true);

    const lines = model.getValue().split('\n');
    const fieldRegex = /^(\s*)(managedFields|ownerReferences|kubectl\.kubernetes\.io\/last-applied-configuration|status):/;

    // Find all ranges to collapse
    const ranges = lines.flatMap((line, i) => {
      const match = line.match(fieldRegex);
      if (!match) return [];

      const indent = match[1].length;
      const endIdx = lines.slice(i + 1).findIndex(l => 
        l.trimStart().length > 0 && l.length - l.trimStart().length <= indent
      );
      const endLine = endIdx === -1 ? lines.length : i + 1 + endIdx;
      
      return endLine > i + 1 ? [{ start: i + 1, end: endLine }] : [];
    });

    // Collapse ranges in reverse order
    for (const { start, end } of ranges.reverse()) {
      editorInstance.setSelection({ startLineNumber: start, startColumn: 1, endLineNumber: end, endColumn: 1 });
      await editorInstance.getAction('editor.fold')?.run();
    }
    editorInstance.setPosition({ lineNumber: 1, column: 1 });
    setEditorReady(true);
  }, []);

  // Convert resource to YAML when it changes
  useEffect(() => {
    if (resource) {
      const yaml = toYaml(resource, { lineWidth: 0 });
      
      // Only update if the server content actually changed
      // and user hasn't made local edits
      if (yaml !== originalValue) {
        if (!isDirty) {
          // No local changes, safe to update
          setValue(yaml);
          setOriginalValue(yaml);
          setParseError(null);
          setSaveError(null);
          
          // Re-collapse noisy sections when content changes
          if (editorRef.current) {
            setEditorReady(false);
            setTimeout(() => collapseNoisySections(editorRef.current!), 100);
          }
        } else {
          // User has local changes, just update the original for comparison
          // This means if they reset, they'll get the latest server version
          setOriginalValue(yaml);
        }
      }
    }
  }, [resource, originalValue, isDirty, collapseNoisySections]);

  // Validate YAML on change
  useEffect(() => {
    if (!value) {
      setParseError(null);
      return;
    }

    try {
      parseYaml(value);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid YAML');
    }
  }, [value]);

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
          return [{
            range: model.getFullModelRange(),
            text: formatted,
          }];
        } catch {
          return [];
        }
      },
    });

    // Auto-collapse noisy sections after a short delay to ensure content is loaded
    setEditorReady(false);
    setTimeout(() => collapseNoisySections(editor), 100);
  };

  const handleChange = (newValue: string | undefined) => {
    const val = newValue || '';
    setValue(val);
    setIsDirty(val !== originalValue);
    setSaveError(null);
  };

  const handleReset = useCallback(() => {
    setValue(originalValue);
    setIsDirty(false);
    setParseError(null);
    setSaveError(null);
  }, [originalValue]);

  const handleSave = useCallback(async () => {
    if (parseError || !isDirty) return;

    try {
      setSaving(true);
      setSaveError(null);
      const parsed = parseYaml(value) as KubernetesResource;
      await onSave(parsed);
      setOriginalValue(value);
      setIsDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [parseError, isDirty, value, onSave]);

  // Expose state to parent via ref callback
  useEffect(() => {
    if (onStateRef) {
      onStateRef({
        isDirty,
        hasError: !!parseError,
        isSaving: saving,
        save: handleSave,
        reset: handleReset,
      });
    }
    return () => {
      if (onStateRef) {
        onStateRef(null);
      }
    };
  }, [onStateRef, isDirty, parseError, saving, handleSave, handleReset]);

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
      {/* Status bar */}
      {(parseError || saveError) && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20">
          {parseError ? (
            <>
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <span className="text-xs text-red-700 dark:text-red-400">Invalid YAML: {parseError}</span>
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
      <div className={`flex-1 min-h-0 transition-opacity duration-150 ${editorReady ? 'opacity-100' : 'opacity-0'}`}>
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
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
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
