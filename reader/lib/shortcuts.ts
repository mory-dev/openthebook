export type ShortcutBinding = readonly string[];

export type Shortcut = {
  readonly label: string;
  readonly bindings: readonly ShortcutBinding[];
  readonly detail: string;
  readonly context?: string;
};

export const SHORTCUT_GROUPS = [
  {
    title: 'Reading',
    items: [
      {
        label: 'Toggle chapter sidebar',
        bindings: [['Ctrl', 'T']],
        detail: 'Show or hide the chapter rail.',
      },
      {
        label: 'Bookmarks and highlights',
        bindings: [['Ctrl', 'B'], ['Ctrl', 'H']],
        detail: 'Show or hide saved highlights.',
      },
      {
        label: 'Settings',
        bindings: [['Ctrl', 'S'], ['Ctrl', '.']],
        detail: 'Open or close the settings panel.',
      },
      {
        label: 'Text size',
        bindings: [['Ctrl', '+'], ['Ctrl', '-']],
        detail: 'Increase or decrease text size.',
      },
      {
        label: 'Reset text size',
        bindings: [['Ctrl', '0']],
        detail: 'Return text to its default size.',
      },
      {
        label: 'Fullscreen',
        bindings: [['Enter']],
        detail: 'Enter distraction-free fullscreen mode when no dialog is open.',
      },
      {
        label: 'Close dialogs or exit fullscreen',
        bindings: [['Esc']],
        detail: 'Close an open panel first, then exit fullscreen.',
      },
      {
        label: 'Close reader',
        bindings: [['Ctrl', 'Q']],
        detail: 'Close the desktop reader window.',
      },
      {
        label: 'Scroll through a book',
        bindings: [['J'], ['K'], ['U'], ['D'], ['ArrowDown'], ['ArrowUp'], ['ArrowLeft'], ['ArrowRight']],
        detail: 'J, D, Down, and Right move forward; K, U, Up, and Left move backward in reflowable books. D, U, Left, and Right move by a viewport; J, K, Up, and Down use the selected scroll step.',
      },
    ],
  },
  {
    title: 'Search and help',
    items: [
      {
        label: 'Find in book',
        bindings: [['Ctrl', 'F']],
        detail: 'Open the in-book search bar.',
      },
      {
        label: 'Next search match',
        bindings: [['Ctrl', 'G'], ['F3'], ['Enter']],
        detail: 'Enter applies while the search bar is focused.',
      },
      {
        label: 'Previous search match',
        bindings: [['Ctrl', 'Shift', 'G'], ['Shift', 'F3'], ['Shift', 'Enter']],
        detail: 'Shift+Enter applies while the search bar is focused.',
      },
      {
        label: 'Shortcuts and help',
        bindings: [['Ctrl', '/'], ['F1'], ['?']],
        detail: 'Open or close the keyboard shortcuts guide.',
      },
    ],
  },
] as readonly { title: string; items: readonly Shortcut[] }[];

export const SHORTCUTS: readonly Shortcut[] = SHORTCUT_GROUPS.flatMap((group) => group.items);
