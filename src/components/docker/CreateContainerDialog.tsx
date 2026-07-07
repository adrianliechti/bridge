import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOption,
  ComboboxOptions,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { Loader2, Plus, X, ArrowRight, ChevronsUpDown, ChevronDown, Check } from 'lucide-react';
import { listImages, runContainer, type RunContainerPhase } from '../../api/docker/docker';

// Split a command line into args, honoring single and double quotes
function splitCommand(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false;

  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) {
        args.push(current);
        current = '';
        started = false;
      }
    } else {
      current += ch;
      started = true;
    }
  }

  if (started) args.push(current);
  return args;
}

const phaseLabels: Record<RunContainerPhase, string> = {
  creating: 'Creating…',
  pulling: 'Pulling image…',
  starting: 'Starting…',
};

interface CreateContainerDialogProps {
  context: string;
  onClose: () => void;
  onCreated: () => void;
}

interface PortRow {
  host: string;
  container: string;
  proto: 'tcp' | 'udp';
}

interface EnvRow {
  key: string;
  value: string;
}

interface VolumeRow {
  source: string;
  target: string;
}

const inputClass =
  'w-full px-3 py-1.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 ' +
  'text-neutral-900 dark:text-neutral-100 rounded-lg text-sm ' +
  'focus:outline-none focus:ring-1 focus:ring-neutral-400/50 dark:focus:ring-neutral-500/50 ' +
  'placeholder:text-neutral-400 dark:placeholder:text-neutral-600';

const selectClass =
  'relative w-20 shrink-0 px-3 py-1.5 pr-7 text-left cursor-pointer ' +
  'bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 ' +
  'text-neutral-900 dark:text-neutral-100 rounded-lg text-sm ' +
  'focus:outline-none focus:ring-1 focus:ring-neutral-400/50 dark:focus:ring-neutral-500/50';

const optionsClass =
  'z-50 mt-1 max-h-48 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-700 ' +
  'bg-white dark:bg-neutral-900 shadow-lg py-1 empty:hidden';

const optionClass =
  'flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer ' +
  'data-focus:bg-neutral-100 dark:data-focus:bg-neutral-800';

const removeButtonClass =
  'p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0';

function SectionHeader({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <Plus size={13} />
        Add
      </button>
    </div>
  );
}

export function CreateContainerDialog({ context, onClose, onCreated }: CreateContainerDialogProps) {
  const [image, setImage] = useState('');
  const [imageQuery, setImageQuery] = useState('');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [ports, setPorts] = useState<PortRow[]>([]);
  const [env, setEnv] = useState<EnvRow[]>([]);
  const [volumes, setVolumes] = useState<VolumeRow[]>([]);

  const [imageSuggestions, setImageSuggestions] = useState<string[]>([]);
  const [phase, setPhase] = useState<RunContainerPhase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitting = phase !== null;

  // Offer locally available images as autocomplete suggestions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const images = await listImages(context);
        if (cancelled) return;
        const tags = images
          .flatMap(i => i.RepoTags ?? [])
          .filter(tag => tag && !tag.includes('<none>'));
        setImageSuggestions([...new Set(tags)].sort());
      } catch {
        // Suggestions are optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context]);

  const filteredImages = imageQuery
    ? imageSuggestions.filter(tag => tag.toLowerCase().includes(imageQuery.toLowerCase()))
    : imageSuggestions;

  const updateRow = <T,>(rows: T[], setRows: (rows: T[]) => void, index: number, patch: Partial<T>) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = <T,>(rows: T[], setRows: (rows: T[]) => void, index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image.trim() || submitting) return;

    setError(null);

    try {
      const commandArgs = splitCommand(command);

      await runContainer(context, {
        image: image.trim(),
        name: name.trim() || undefined,
        command: commandArgs.length ? commandArgs : undefined,
        // A single port means the same port on both sides (8080 → 8080:8080)
        ports: ports
          .filter(p => p.host.trim() || p.container.trim())
          .map(p => {
            const containerPort = p.container.trim() || p.host.trim();
            const hostPort = p.host.trim();
            return `${hostPort ? `${hostPort}:` : ''}${containerPort}/${p.proto}`;
          }),
        env: env
          .filter(v => v.key.trim())
          .map(v => `${v.key.trim()}=${v.value}`),
        volumes: volumes
          .filter(v => v.source.trim() && v.target.trim())
          .map(v => `${v.source.trim()}:${v.target.trim()}`),
      }, setPhase);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run container');
      setPhase(null);
    }
  };

  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/50 duration-150 data-closed:opacity-0"
      />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[85vh] duration-150 data-closed:opacity-0 data-closed:scale-95"
        >
          {/* Header */}
          <div className="shrink-0 px-5 pt-5 pb-4 flex items-start justify-between">
            <div>
              <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Run Container
              </DialogTitle>
              <p className="text-xs text-neutral-500 mt-0.5">
                Create and start a new container in <span className="font-medium">{context}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <fieldset disabled={submitting} className="contents">
            <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-5">
              {/* Image + Name + Command */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">
                    Image
                  </label>
                  <Combobox value={image} onChange={value => setImage(value ?? '')} onClose={() => setImageQuery('')}>
                    <div className="relative">
                      <ComboboxInput
                        className={`${inputClass} pr-8`}
                        displayValue={(value: string) => value}
                        onChange={e => {
                          setImageQuery(e.target.value);
                          setImage(e.target.value);
                        }}
                        placeholder="nginx:latest"
                        autoFocus
                        required
                      />
                      <ComboboxButton className="absolute inset-y-0 right-0 px-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                        <ChevronsUpDown size={14} />
                      </ComboboxButton>
                    </div>
                    <ComboboxOptions anchor="bottom start" modal={false} className={`${optionsClass} w-(--input-width)`}>
                      {filteredImages.map(tag => (
                        <ComboboxOption key={tag} value={tag} className={`${optionClass} font-mono text-xs`}>
                          <span className="truncate min-w-0" title={tag}>{tag}</span>
                        </ComboboxOption>
                      ))}
                    </ComboboxOptions>
                  </Combobox>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">
                      Name <span className="text-neutral-400 dark:text-neutral-600 font-normal">optional</span>
                    </label>
                    <input
                      className={inputClass}
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="my-container"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">
                      Command <span className="text-neutral-400 dark:text-neutral-600 font-normal">optional</span>
                    </label>
                    <input
                      className={`${inputClass} font-mono`}
                      value={command}
                      onChange={e => setCommand(e.target.value)}
                      placeholder="image default"
                    />
                  </div>
                </div>
              </div>

              {/* Ports */}
              <div className="space-y-2">
                <SectionHeader label="Ports" onAdd={() => setPorts([...ports, { host: '', container: '', proto: 'tcp' }])} />
                {ports.map((port, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={`${inputClass} font-mono flex-1 min-w-0`}
                      value={port.host}
                      onChange={e => updateRow(ports, setPorts, i, { host: e.target.value })}
                      placeholder="8080"
                      aria-label="Host port"
                    />
                    <ArrowRight size={14} className="text-neutral-400 shrink-0" />
                    <input
                      className={`${inputClass} font-mono flex-1 min-w-0`}
                      value={port.container}
                      onChange={e => updateRow(ports, setPorts, i, { container: e.target.value })}
                      placeholder="80"
                      aria-label="Container port"
                    />
                    <Listbox value={port.proto} onChange={value => updateRow(ports, setPorts, i, { proto: value })}>
                      <ListboxButton className={selectClass} aria-label="Protocol">
                        {port.proto}
                        <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400" />
                      </ListboxButton>
                      <ListboxOptions anchor="bottom" modal={false} className={`${optionsClass} w-(--button-width)`}>
                        {(['tcp', 'udp'] as const).map(proto => (
                          <ListboxOption key={proto} value={proto} className={optionClass}>
                            {proto}
                            {port.proto === proto && <Check size={13} className="text-blue-500" />}
                          </ListboxOption>
                        ))}
                      </ListboxOptions>
                    </Listbox>
                    <button type="button" onClick={() => removeRow(ports, setPorts, i)} className={removeButtonClass} aria-label="Remove port">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Environment */}
              <div className="space-y-2">
                <SectionHeader label="Environment" onAdd={() => setEnv([...env, { key: '', value: '' }])} />
                {env.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={`${inputClass} font-mono`}
                      value={row.key}
                      onChange={e => updateRow(env, setEnv, i, { key: e.target.value })}
                      placeholder="KEY"
                      aria-label="Variable name"
                    />
                    <span className="text-neutral-400 text-sm shrink-0">=</span>
                    <input
                      className={`${inputClass} font-mono`}
                      value={row.value}
                      onChange={e => updateRow(env, setEnv, i, { value: e.target.value })}
                      placeholder="value"
                      aria-label="Variable value"
                    />
                    <button type="button" onClick={() => removeRow(env, setEnv, i)} className={removeButtonClass} aria-label="Remove variable">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Volumes */}
              <div className="space-y-2">
                <SectionHeader label="Volumes" onAdd={() => setVolumes([...volumes, { source: '', target: '' }])} />
                {volumes.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={`${inputClass} font-mono`}
                      value={row.source}
                      onChange={e => updateRow(volumes, setVolumes, i, { source: e.target.value })}
                      placeholder="/host/path or volume"
                      aria-label="Volume source"
                    />
                    <ArrowRight size={14} className="text-neutral-400 shrink-0" />
                    <input
                      className={`${inputClass} font-mono`}
                      value={row.target}
                      onChange={e => updateRow(volumes, setVolumes, i, { target: e.target.value })}
                      placeholder="/container/path"
                      aria-label="Volume target"
                    />
                    <button type="button" onClick={() => removeRow(volumes, setVolumes, i)} className={removeButtonClass} aria-label="Remove volume">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-600 dark:text-red-400 break-words">
                  {error}
                </div>
              )}
            </div>
            </fieldset>

            {/* Footer */}
            <div className="shrink-0 px-5 py-4 mt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3.5 py-1.5 text-sm font-medium rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!image.trim() || submitting}
                className="px-3.5 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {phase ? phaseLabels[phase] : 'Run'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
