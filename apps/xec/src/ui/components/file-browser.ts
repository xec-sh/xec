import path from 'path';
import fs from 'fs/promises';
import {
  aura,
  signal,
  effect,
  computed,
  ParsedKey,
  BoxComponent,
  TruncateMode,
  TextComponent,
  type TableRow,
  InputComponent,
  TableComponent,
  type TableColumn,
  InputComponentEvents
} from '@xec-sh/aura';

interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: Date;
  permissions: string;
}

/**
 * File Browser Component
 * Provides a reactive file system browser with path editing, filtering, and file selection
 */
export function FileBrowserComponent(initialPath?: string) {
  // State signals
  const currentPath = signal(initialPath || process.cwd());
  const files = signal<FileInfo[]>([]);
  const filter = signal('');
  const showFilterInput = signal(false);
  const editingPath = signal(false);
  const selectedFiles = signal<Set<string>>(new Set());
  const focusedIndex = signal(0);

  // Component refs
  const boxRef = signal<BoxComponent | null>(null);
  const pathInputRef = signal<InputComponent | null>(null);
  const pathTextRef = signal<TextComponent | null>(null);
  const filterInputRef = signal<InputComponent | null>(null);
  const tableRef = signal<TableComponent | null>(null);

  // Load files for current directory
  const loadFiles = async () => {
    try {
      const dirPath = currentPath();
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      const fileInfos: FileInfo[] = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name);
          try {
            const stats = await fs.stat(fullPath);
            return {
              name: entry.name,
              type: entry.isDirectory() ? 'directory' as const : 'file' as const,
              size: stats.size,
              modified: stats.mtime,
              permissions: stats.mode.toString(8).slice(-3)
            };
          } catch (error) {
            // Handle permission errors gracefully
            return {
              name: entry.name,
              type: entry.isDirectory() ? 'directory' as const : 'file' as const,
              size: 0,
              modified: new Date(),
              permissions: '---'
            };
          }
        })
      );

      // Sort: directories first, then alphabetically
      fileInfos.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      files.set(fileInfos);
    } catch (error) {
      console.error('Error loading files:', error);
      files.set([]);
    }
  };

  // Initial load
  effect(() => {
    loadFiles();
  });

  // Reload when path changes
  effect(() => {
    const newPath = currentPath();
    loadFiles();
  });

  // Filtered files based on filter input
  const filteredFiles = computed(() => {
    const filterValue = filter().toLowerCase();
    if (!filterValue) return files();

    return files().filter(file =>
      file.name.toLowerCase().includes(filterValue)
    );
  });

  // Table columns configuration
  const columns: TableColumn[] = [
    {
      key: 'icon',
      title: '',
      width: 2,
      align: 'center',
      formatter: (value: any) => value as string
    },
    {
      key: 'name',
      title: 'Name',
      width: 'auto',
      align: 'left',
      truncate: TruncateMode.END,
    },
    {
      key: 'size',
      title: 'Size',
      width: 10,
      align: 'right',
      formatter: (value: number) => formatFileSize(value)
    },
    {
      key: 'modified',
      title: 'Modified',
      width: 16,
      align: 'left',
      formatter: (value: Date) => formatDate(value)
    },
    {
      key: 'permissions',
      title: 'Perms',
      width: 5,
      align: 'center'
    }
  ];

  // Convert files to table rows
  const tableRows = computed<TableRow[]>(() => filteredFiles().map(file => ({
    icon: file.type === 'directory' ? '▶' : ' ',
    name: file.name,
    size: file.size,
    modified: file.modified,
    permissions: file.permissions,
    _id: file.name,
    _selected: selectedFiles().has(file.name)
  })));

  // Status text
  const statusText = computed(() => {
    const totalFiles = files();
    const dirs = totalFiles.filter(f => f.type === 'directory').length;
    const fileCount = totalFiles.filter(f => f.type === 'file').length;
    const selected = selectedFiles().size;

    let status = `${dirs} dir(s) / ${fileCount} file(s)`;
    if (selected > 0) {
      status += ` | ${selected} selected`;
    }
    if (filter()) {
      status += ` | filtered: ${filteredFiles().length}`;
    }
    return status;
  });

  // Handle navigation
  const navigateToFile = async (fileName: string) => {
    const file = files().find(f => f.name === fileName);
    if (file && file.type === 'directory') {
      const newPath = path.join(currentPath(), fileName);
      currentPath.set(newPath);
      selectedFiles.set(new Set());
      focusedIndex.set(0);
    }
  };

  const navigateUp = () => {
    const parentPath = path.dirname(currentPath());
    if (parentPath !== currentPath()) {
      currentPath.set(parentPath);
      selectedFiles.set(new Set());
      focusedIndex.set(0);
    }
  };

  // Format helpers
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return aura('box', {
    id: 'file-browser',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    height: '100%',
    gap: 1,
    filledGaps: true,
    width: 'auto',
    border: true,
    ref: boxRef,
    onKeyDown: (key: ParsedKey) => {
      // Toggle filter input with '/'
      if (key.name === '/' && !editingPath() && !showFilterInput()) {
        showFilterInput.set(true);
        setTimeout(() => filterInputRef()?.focus(), 0);
        return;
      }

      // Hide filter on Escape
      if (key.name === 'escape') {
        if (showFilterInput()) {
          showFilterInput.set(false);
          filter.set('');
          tableRef()?.focus();
        } else if (editingPath()) {
          editingPath.set(false);
          pathInputRef()?.blur();
        }
        return;
      }

      // Navigate up with backspace
      if (key.name === 'backspace' && !editingPath() && !showFilterInput()) {
        navigateUp();
        return;
      }

      // Toggle path editing with 'e'
      if (key.name === 'e' && !editingPath() && !showFilterInput()) {
        editingPath.set(true);
        setTimeout(() => pathInputRef()?.focus(), 0);
        return;
      }

      // Enter to navigate into directory
      if (key.name === 'return' && !editingPath() && !showFilterInput()) {
        const table = tableRef();
        if (table && table.selectedIndices) {
          const indices = Array.from(table.selectedIndices);
          if (indices.length > 0) {
            const selectedIndex = indices[0];
            if (selectedIndex !== undefined) {
              const row = tableRows()[selectedIndex];
              if (row) {
                navigateToFile(row['name']);
              }
            }
          }
        }
        return;
      }
    },
    children: [
      // Path display/edit row
      aura('box', {
        height: 1,
        children: [
          // Path text (shown when not editing)
          aura('text', {
            content: computed(() => ` ${currentPath()}`),
            fg: 'primary',
            visible: computed(() => !editingPath()),
            ref: pathTextRef,
          }),
          // Path input (shown when editing)
          aura('input', {
            value: currentPath,
            placeholder: 'enter path...',
            visible: computed(() => editingPath()),
            ref: pathInputRef,
            onMount: () => {
              const input = pathInputRef();
              if (input) {
                // Listen to input events
                input.on(InputComponentEvents.ENTER, (value: string) => {
                  currentPath.set(value);
                  editingPath.set(false);
                });
              }
              // No cleanup needed
              return undefined;
            },
            onKeyDown: (key: ParsedKey) => {
              if (key.name === 'escape') {
                editingPath.set(false);
                pathInputRef()?.blur();
              }
            }
          })
        ]
      }),

      // Separator
      // aura('box', {
      //   height: 1,
      //   border: ['top'],
      //   borderStyle: 'single',
      // }),

      // Filter input row (conditionally visible)
      showFilterInput() ?
        aura('box', {
          height: 1,
          padding: 1,
          children: [
            aura('text', {
              content: '🔍 ',
              fg: 'muted'
            }),
            aura('input', {
              value: filter,
              placeholder: 'Filter files...',
              ref: filterInputRef,
              onMount: () => {
                const input = filterInputRef();
                if (input) {
                  // Listen to input changes
                  input.on(InputComponentEvents.INPUT, (value: string) => {
                    filter.set(value);
                  });

                  input.on(InputComponentEvents.ENTER, () => {
                    showFilterInput.set(false);
                    tableRef()?.focus();
                  });
                }
              },
              onKeyDown: (key: ParsedKey) => {
                if (key.name === 'escape') {
                  showFilterInput.set(false);
                  filter.set('');
                  tableRef()?.focus();
                }
              }
            })
          ]
        }) :
        aura('box', { height: 0 }), // Empty spacer when hidden

      // File table
      aura('table', {
        columns,
        rows: tableRows,
        showHeader: true,
        showBorder: false,
        scrollable: true,
        selectable: true,
        multiSelect: true,
        alternateRowColors: true,
        ref: tableRef,
        flexGrow: 1,
        onRowSelect: (row: TableRow) => {
          if (row) {
            const newSelected = new Set(selectedFiles());
            if (newSelected.has(row['name'])) {
              newSelected.delete(row['name']);
            } else {
              newSelected.add(row['name']);
            }
            selectedFiles.set(newSelected);
          }
        }
      }),

      // Status bar
      aura('box', {

        alignItems: 'center',
        children: [
          aura('text', {
            content: statusText,
            fg: 'description',
            selectable: false
          })
        ]
      })
    ]
  });
}

export default FileBrowserComponent;