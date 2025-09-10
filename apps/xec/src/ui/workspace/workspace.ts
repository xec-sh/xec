import { signal, VStack } from "@xec-sh/aura";


export function WorkspaceComponent() {
  const containerRef = signal<any>(null);

  // // Example focusable areas in workspace
  // const editorRef = signal<any>(null);
  // const terminalRef = signal<any>(null);

  // // Register workspace components with focus manager
  // effect(() => {
  //   const container = containerRef();
  //   if (container) {
  //     useFocusable(container, {
  //       groupId: 'workspace',
  //       order: 0,
  //     });
  //   }
  // });

  // effect(() => {
  //   const editor = editorRef();
  //   if (editor) {
  //     useFocusable(editor, {
  //       groupId: 'workspace',
  //       order: 1,
  //     });
  //   }
  // });

  // effect(() => {
  //   const terminal = terminalRef();
  //   if (terminal) {
  //     useFocusable(terminal, {
  //       groupId: 'workspace',
  //       order: 2,
  //     });
  //   }
  // });

  return VStack({
    id: 'workspace',
    width: '100%',
    height: '100%',
    flexGrow: 1,
    flexShrink: 1,
    gap: 1,
    border: true,
    ref: containerRef,
  },
    //   // Header
    //   Box({
    //     id: 'workspace-header',
    //     height: 1,
    //     alignItems: 'center',
    //     paddingLeft: 1,
    //   },
    //     Text({
    //       content: 'Workspace',
    //       fg: computed(() => isFocused('workspace') ? 'accent' : 'muted'),
    //       attributes: TextAttributes.BOLD,
    //     }),
    //   ),

    //   // Main content area (editor)
    //   Box({
    //     id: 'editor',
    //     height: '50%',
    //     border: true,
    //     ref: editorRef,
    //     paddingLeft: 1,
    //     paddingTop: 1,
    //   },
    //     Text({
    //       content: computed(() =>
    //         isFocused('editor')
    //           ? '📝 Editor (focused - Tab to navigate)'
    //           : '📝 Editor'
    //       ),
    //       fg: computed(() => isFocused('editor') ? 'primary' : 'foreground'),
    //     }),
    //   ),

    //   // Terminal area
    //   Box({
    //     id: 'terminal',
    //     flexGrow: 1,
    //     border: true,
    //     ref: terminalRef,
    //     paddingLeft: 1,
    //     paddingTop: 1,
    //   },
    //     Text({
    //       content: computed(() =>
    //         isFocused('terminal')
    //           ? '> Terminal (focused - Tab to navigate)'
    //           : '> Terminal'
    //       ),
    //       fg: computed(() => isFocused('terminal') ? 'success' : 'foreground'),
    //     }),
    //   ),
  );
}