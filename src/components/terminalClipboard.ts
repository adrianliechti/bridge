import type { Terminal } from '@xterm/xterm';

type ClipboardTerminal = Pick<
  Terminal,
  'attachCustomKeyEventHandler' | 'getSelection' | 'hasSelection' | 'paste' | 'focus'
>;

export function attachTerminalClipboard(
  terminal: ClipboardTerminal,
  onError: (message: string) => void,
) {
  let disposed = false;
  let pasteGeneration = 0;

  const copy = async () => {
    const selection = terminal.getSelection();
    if (!selection || disposed) return;
    try {
      await navigator.clipboard.writeText(selection);
      if (!disposed) onError('');
    } catch {
      if (!disposed)
        onError('Clipboard access was denied. Use the terminal’s right-click Copy menu.');
    }
  };

  const paste = async () => {
    if (disposed) return;
    const generation = pasteGeneration;
    try {
      const text = await navigator.clipboard.readText();
      if (disposed || generation !== pasteGeneration) return;
      // xterm handles newline normalization and the shell's bracketed paste mode.
      terminal.paste(text);
      terminal.focus();
      onError('');
    } catch {
      if (!disposed)
        onError('Clipboard access was denied. Use Cmd+V, Ctrl+V, or the right-click Paste menu.');
    }
  };

  terminal.attachCustomKeyEventHandler((event) => {
    if (event.altKey || event.isComposing) return true;
    const key = event.key.toLowerCase();
    if (key !== 'c' && key !== 'v') return true;

    // Preserve native clipboard events, including the desktop Edit menu.
    // Ctrl+C without a selection must still interrupt the foreground process.
    if (
      (event.metaKey && !event.ctrlKey) ||
      (event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (key === 'v' || terminal.hasSelection()))
    ) {
      return false;
    }

    if (event.ctrlKey && event.shiftKey && !event.metaKey) {
      event.preventDefault();
      if (event.type === 'keydown' && !event.repeat) {
        void (key === 'c' ? copy() : paste());
      }
      return false;
    }
    return true;
  });

  return {
    copy,
    paste,
    cancelPendingPaste() {
      pasteGeneration++;
    },
    dispose() {
      disposed = true;
      terminal.attachCustomKeyEventHandler(() => true);
    },
  };
}

export type TerminalClipboard = ReturnType<typeof attachTerminalClipboard>;
