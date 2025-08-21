import {
  Edge,
  Unit,
  Wrap,
  Align,
  Gutter,
  Display,
  Justify,
  LogLevel,
  Overflow,
  BoxSizing,
  Dimension,
  Direction,
  MeasureMode,
  PositionType,
  FlexDirection,
} from "yoga-layout"

export type AlignString =
  | "auto"
  | "flex-start"
  | "center"
  | "flex-end"
  | "stretch"
  | "baseline"
  | "space-between"
  | "space-around"
  | "space-evenly"
export type BoxSizingString = "border-box" | "content-box"
export type DimensionString = "width" | "height"
export type DirectionString = "inherit" | "ltr" | "rtl"
export type DisplayString = "flex" | "none" | "contents"
export type EdgeString = "left" | "top" | "right" | "bottom" | "start" | "end" | "horizontal" | "vertical" | "all"
export type FlexDirectionString = "column" | "column-reverse" | "row" | "row-reverse"
export type GutterString = "column" | "row" | "all"
export type JustifyString = "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly"
export type LogLevelString = "error" | "warn" | "info" | "debug" | "verbose" | "fatal"
export type MeasureModeString = "undefined" | "exactly" | "at-most"
export type OverflowString = "visible" | "hidden" | "scroll"
export type PositionTypeString = "static" | "relative" | "absolute"
export type UnitString = "undefined" | "point" | "percent" | "auto"
export type WrapString = "no-wrap" | "wrap" | "wrap-reverse"

export function parseAlign(value: string): Align {
  switch (value.toLowerCase()) {
    case "auto":
      return Align.Auto
    case "flex-start":
      return Align.FlexStart
    case "center":
      return Align.Center
    case "flex-end":
      return Align.FlexEnd
    case "stretch":
      return Align.Stretch
    case "baseline":
      return Align.Baseline
    case "space-between":
      return Align.SpaceBetween
    case "space-around":
      return Align.SpaceAround
    case "space-evenly":
      return Align.SpaceEvenly
    default:
      return Align.Auto
  }
}

export function parseBoxSizing(value: string): BoxSizing {
  switch (value.toLowerCase()) {
    case "border-box":
      return BoxSizing.BorderBox
    case "content-box":
      return BoxSizing.ContentBox
    default:
      return BoxSizing.BorderBox
  }
}

export function parseDimension(value: string): Dimension {
  switch (value.toLowerCase()) {
    case "width":
      return Dimension.Width
    case "height":
      return Dimension.Height
    default:
      return Dimension.Width
  }
}

export function parseDirection(value: string): Direction {
  switch (value.toLowerCase()) {
    case "inherit":
      return Direction.Inherit
    case "ltr":
      return Direction.LTR
    case "rtl":
      return Direction.RTL
    default:
      return Direction.LTR
  }
}

export function parseDisplay(value: string): Display {
  switch (value.toLowerCase()) {
    case "flex":
      return Display.Flex
    case "none":
      return Display.None
    case "contents":
      return Display.Contents
    default:
      return Display.Flex
  }
}

export function parseEdge(value: string): Edge {
  switch (value.toLowerCase()) {
    case "left":
      return Edge.Left
    case "top":
      return Edge.Top
    case "right":
      return Edge.Right
    case "bottom":
      return Edge.Bottom
    case "start":
      return Edge.Start
    case "end":
      return Edge.End
    case "horizontal":
      return Edge.Horizontal
    case "vertical":
      return Edge.Vertical
    case "all":
      return Edge.All
    default:
      return Edge.All
  }
}

export function parseFlexDirection(value: string): FlexDirection {
  switch (value.toLowerCase()) {
    case "column":
      return FlexDirection.Column
    case "column-reverse":
      return FlexDirection.ColumnReverse
    case "row":
      return FlexDirection.Row
    case "row-reverse":
      return FlexDirection.RowReverse
    default:
      return FlexDirection.Column
  }
}

export function parseGutter(value: string): Gutter {
  switch (value.toLowerCase()) {
    case "column":
      return Gutter.Column
    case "row":
      return Gutter.Row
    case "all":
      return Gutter.All
    default:
      return Gutter.All
  }
}

export function parseJustify(value: string): Justify {
  switch (value.toLowerCase()) {
    case "flex-start":
      return Justify.FlexStart
    case "center":
      return Justify.Center
    case "flex-end":
      return Justify.FlexEnd
    case "space-between":
      return Justify.SpaceBetween
    case "space-around":
      return Justify.SpaceAround
    case "space-evenly":
      return Justify.SpaceEvenly
    default:
      return Justify.FlexStart
  }
}

export function parseLogLevel(value: string): LogLevel {
  switch (value.toLowerCase()) {
    case "error":
      return LogLevel.Error
    case "warn":
      return LogLevel.Warn
    case "info":
      return LogLevel.Info
    case "debug":
      return LogLevel.Debug
    case "verbose":
      return LogLevel.Verbose
    case "fatal":
      return LogLevel.Fatal
    default:
      return LogLevel.Info
  }
}

export function parseMeasureMode(value: string): MeasureMode {
  switch (value.toLowerCase()) {
    case "undefined":
      return MeasureMode.Undefined
    case "exactly":
      return MeasureMode.Exactly
    case "at-most":
      return MeasureMode.AtMost
    default:
      return MeasureMode.Undefined
  }
}

export function parseOverflow(value: string): Overflow {
  switch (value.toLowerCase()) {
    case "visible":
      return Overflow.Visible
    case "hidden":
      return Overflow.Hidden
    case "scroll":
      return Overflow.Scroll
    default:
      return Overflow.Visible
  }
}

export function parsePositionType(value: string): PositionType {
  switch (value.toLowerCase()) {
    case "static":
      return PositionType.Static
    case "relative":
      return PositionType.Relative
    case "absolute":
      return PositionType.Absolute
    default:
      return PositionType.Static
  }
}

export function parseUnit(value: string): Unit {
  switch (value.toLowerCase()) {
    case "undefined":
      return Unit.Undefined
    case "point":
      return Unit.Point
    case "percent":
      return Unit.Percent
    case "auto":
      return Unit.Auto
    default:
      return Unit.Point
  }
}

export function parseWrap(value: string): Wrap {
  switch (value.toLowerCase()) {
    case "no-wrap":
      return Wrap.NoWrap
    case "wrap":
      return Wrap.Wrap
    case "wrap-reverse":
      return Wrap.WrapReverse
    default:
      return Wrap.NoWrap
  }
}
