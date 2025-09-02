import { getKeyHandler } from "../src/lib/key-handler"
import { TextComponent } from "../src/components/text"
import { setupCommonDemoKeys } from "./lib/standalone-keys"
import {
  t,
  fg,
  bold,
  TruncateMode,
  type Renderer,
  type TableRow,
  GroupComponent,
  createRenderer,
  TableComponent,
  type TableColumn,
  TableComponentEvents,
} from "../src/index"

let tableElement: TableComponent | null = null
let renderer: Renderer | null = null
let keyboardHandler: ((key: any) => void) | null = null
let keyLegendDisplay: TextComponent | null = null
let statusDisplay: TextComponent | null = null
let lastActionText: string = "Welcome to Table demo! Use the controls to test features."
let lastActionColor: string = "#FFCC00"

// Sample data for the table
const tableColumns: TableColumn[] = [
  { key: "id", title: "ID", width: 6, align: "center" },
  { key: "name", title: "Name", width: 20, align: "left" },
  { key: "email", title: "Email", width: 25, align: "left", truncate: TruncateMode.END },
  { key: "role", title: "Role", width: 15, align: "center" },
  { key: "status", title: "Status", width: 10, align: "center", formatter: (value) => value ? "✓ Active" : "✗ Inactive" },
  { key: "score", title: "Score", width: 8, align: "right", sortable: true },
]

const generateTableRows = (): TableRow[] => {
  const names = ["Alice Johnson", "Bob Smith", "Charlie Brown", "Diana Prince", "Eve Adams",
    "Frank Miller", "Grace Hopper", "Henry Ford", "Ivy League", "Jack Sparrow",
    "Kate Winslet", "Leo DiCaprio", "Maria Garcia", "Nathan Drake", "Olivia Wilde",
    "Peter Parker", "Quinn Fabray", "Rachel Green", "Steve Rogers", "Tony Stark"]
  const roles = ["Admin", "Developer", "Designer", "Manager", "Analyst"]
  const domains = ["gmail.com", "outlook.com", "company.com", "example.org"]

  return names.map((name, index) => ({
    id: index + 1,
    name,
    email: `${name.toLowerCase().replace(" ", ".")}@${domains[index % domains.length]}`,
    role: roles[index % roles.length],
    status: Math.random() > 0.3,
    score: Math.floor(Math.random() * 100),
    _disabled: index === 3 // Disable row 4 for demonstration
  }))
}

let tableRows = generateTableRows()

function updateDisplays() {
  if (!tableElement) return

  const showBorder = tableElement["_showBorder"] ? "on" : "off"
  const showHeader = tableElement["_showHeader"] ? "on" : "off"
  const alternateColors = tableElement["_alternateRowColors"] ? "on" : "off"
  const selectable = tableElement["_selectable"] ? "on" : "off"
  const multiSelect = tableElement["_multiSelect"] ? "on" : "off"
  const sortable = tableElement.sortable ? "on" : "off"

  const keyLegendText = t`${bold(fg("#FFFFFF")("Key Controls:"))}
↑/↓ or j/k: Navigate rows
PgUp/PgDn: Fast scroll
Home/End: Go to first/last row
Space: Toggle selection
Enter: Select row
F: Toggle focus
B: Toggle borders
H: Toggle header
A: Toggle alternate colors
S: Toggle sorting
M: Toggle multi-select
Ctrl+A: Select all (multi-select)
1-6: Sort by column`

  if (keyLegendDisplay) {
    keyLegendDisplay.content = keyLegendText
  }

  const selectedRows = tableElement.selectedRows
  const selectedIndices = tableElement.selectedIndices
  const selectionText = selectedRows.length > 0
    ? `Selected: ${selectedRows.map((r: TableRow) => r.name).join(", ")} (Indices: ${selectedIndices.join(", ")})`
    : "No selection"

  const focusText = tableElement.focused ? "Table is FOCUSED" : "Table is BLURRED"
  const focusColor = tableElement.focused ? "#00FF00" : "#FF0000"

  const sortColumn = tableElement["_sortColumn"] || "none"
  const sortDirection = tableElement["_sortDirection"] || "none"

  const statusText = t`${fg("#00FF00")(selectionText)}

${fg(focusColor)(focusText)}

${fg("#CCCCCC")(`Border: ${showBorder} | Header: ${showHeader} | Alt colors: ${alternateColors}`)}
${fg("#CCCCCC")(`Selectable: ${selectable} | Multi: ${multiSelect} | Sortable: ${sortable}`)}
${fg("#CCCCCC")(`Sort: ${sortColumn} (${sortDirection})`)}

${fg(lastActionColor)(lastActionText)}`

  if (statusDisplay) {
    statusDisplay.content = statusText
  }
}

export function run(rendererInstance: Renderer): void {
  renderer = rendererInstance
  renderer.setBackgroundColor("#001122")

  const parentContainer = new GroupComponent(renderer.root.ctx, {
    id: "parent-container",
    zIndex: 10,
    visible: true,
  })
  renderer.root.add(parentContainer)

  tableElement = new TableComponent(renderer.root.ctx, {
    id: "demo-table",
    position: "absolute",
    left: 2,
    top: 2,
    width: 90,
    height: 20,
    columns: tableColumns,
    rows: tableRows,
    zIndex: 100,

    // Layout options
    showHeader: true,
    showBorder: true,
    borderStyle: 'rounded',
    columnDivider: true,
    rowDivider: false,
    compactMode: false,

    // Behavior options
    selectable: true,
    multiSelect: false,
    sortable: true,
    scrollable: true,
    wrapText: false,

    // Appearance options
    alternateRowColors: true,
    highlightOnHover: true,
    headerStyle: { bold: true },

    // Colors
    backgroundColor: "transparent",
    borderColor: "#334455",
    headerBackgroundColor: "#1e293b",
    headerTextColor: "#ffffff",
    selectedBackgroundColor: "#3b82f6",
    selectedTextColor: "#ffffff",
    alternateRowColor: "#1a1a2e",
    textColor: "#e2e8f0",
    focusedBackgroundColor: "#475569",
    focusedTextColor: "#f8fafc",
    disabledTextColor: "#666666",
    disabledBackgroundColor: "#2a2a2a",

    // Events
    onRowSelect: (row, index) => {
      lastActionText = `Row selected: ${row.name} at index ${index}`
      lastActionColor = "#00FF00"
      updateDisplays()
    },

    onSort: (column, direction) => {
      lastActionText = `Sorted by ${column.title} (${direction})`
      lastActionColor = "#FF00FF"
      updateDisplays()
    },

    fastScrollStep: 5,
  })

  renderer.root.add(tableElement)

  keyLegendDisplay = new TextComponent(renderer.root.ctx, {
    id: "key-legend",
    content: t``,
    width: 45,
    height: 16,
    position: "absolute",
    left: 95,
    top: 2,
    zIndex: 50,
    fg: "#AAAAAA",
  })
  parentContainer.add(keyLegendDisplay)

  statusDisplay = new TextComponent(renderer.root.ctx, {
    id: "status-display",
    content: t``,
    width: 80,
    height: 10,
    position: "absolute",
    left: 2,
    top: 24,
    zIndex: 50,
  })
  parentContainer.add(statusDisplay)

  tableElement.on(TableComponentEvents.ROW_SELECTED, (event: any) => {
    lastActionText = `Event: Row ${event.selected ? "selected" : "deselected"}: ${event.row.name}`
    lastActionColor = "#FFCC00"
    updateDisplays()
  })

  tableElement.on(TableComponentEvents.SORT_CHANGED, (event: any) => {
    lastActionText = `Event: Sort changed to ${event.column.title} (${event.direction})`
    lastActionColor = "#FF00FF"
    updateDisplays()
  })

  updateDisplays()

  keyboardHandler = (key) => {
    if (key.name === "f") {
      if (tableElement?.focused) {
        tableElement.blur()
        lastActionText = "Focus removed from table"
      } else {
        tableElement?.focus()
        lastActionText = "Table focused"
      }
      lastActionColor = "#FFCC00"
      updateDisplays()
    } else if (key.name === "b") {
      const newState = !tableElement?.["_showBorder"]
      tableElement!["_showBorder"] = newState
      tableElement!.requestRender()
      lastActionText = `Borders ${newState ? "enabled" : "disabled"}`
      lastActionColor = "#FFCC00"
      updateDisplays()
    } else if (key.name === "h") {
      const newState = !tableElement?.["_showHeader"]
      tableElement!["_showHeader"] = newState
      tableElement!.requestRender()
      lastActionText = `Header ${newState ? "enabled" : "disabled"}`
      lastActionColor = "#FFCC00"
      updateDisplays()
    } else if (key.name === "a") {
      const newState = !tableElement?.["_alternateRowColors"]
      tableElement!["_alternateRowColors"] = newState
      tableElement!.requestRender()
      lastActionText = `Alternate row colors ${newState ? "enabled" : "disabled"}`
      lastActionColor = "#FFCC00"
      updateDisplays()
    } else if (key.name === "s") {
      const newState = !tableElement?.sortable
      tableElement!.sortable = newState
      lastActionText = `Sorting ${newState ? "enabled" : "disabled"}`
      lastActionColor = "#FFCC00"
      updateDisplays()
    } else if (key.name === "m") {
      const newState = !tableElement?.["_multiSelect"]
      tableElement!["_multiSelect"] = newState
      if (!newState) {
        tableElement!.clearSelection()
      }
      lastActionText = `Multi-select ${newState ? "enabled" : "disabled"}`
      lastActionColor = "#FFCC00"
      updateDisplays()
    } else if (key.name >= "1" && key.name <= "6") {
      const columnIndex = parseInt(key.name) - 1
      if (columnIndex < tableColumns.length) {
        tableElement?.sortByColumn(tableColumns[columnIndex].key)
        lastActionText = `Sorted by ${tableColumns[columnIndex].title}`
        lastActionColor = "#FF00FF"
        updateDisplays()
      }
    } else if (key.name === "r") {
      // Refresh data
      tableRows = generateTableRows()
      tableElement!.rows = tableRows
      lastActionText = "Table data refreshed"
      lastActionColor = "#00FFFF"
      updateDisplays()
    } else if (key.name === "c") {
      // Clear selection
      tableElement?.clearSelection()
      lastActionText = "Selection cleared"
      lastActionColor = "#FFCC00"
      updateDisplays()
    } else if (key.name === "d") {
      // Toggle row dividers
      const newState = !tableElement?.["_rowDivider"]
      tableElement!["_rowDivider"] = newState
      tableElement!.requestRender()
      lastActionText = `Row dividers ${newState ? "enabled" : "disabled"}`
      lastActionColor = "#FFCC00"
      updateDisplays()
    }
  }

  getKeyHandler().on("keypress", keyboardHandler)
  tableElement.focus()
}

export function destroy(rendererInstance: Renderer): void {
  if (keyboardHandler) {
    getKeyHandler().off("keypress", keyboardHandler)
    keyboardHandler = null
  }

  if (tableElement) {
    rendererInstance.root.remove(tableElement.id)
    tableElement.destroy()
    tableElement = null
  }

  rendererInstance.root.remove("parent-container")

  keyLegendDisplay = null
  statusDisplay = null
  renderer = null
}

if (import.meta.main) {
  const renderer = await createRenderer({
    useAlternateScreen: true,
    exitOnCtrlC: true,
  })

  run(renderer)
  setupCommonDemoKeys(renderer)
  renderer.start()
}