use std::fmt::Write;
use std::io;

pub type RGBA = [f32; 4];

#[derive(Debug)]
pub enum AnsiError {
    InvalidFormat,
    WriteFailed,
}

impl From<std::fmt::Error> for AnsiError {
    fn from(_: std::fmt::Error) -> Self {
        AnsiError::WriteFailed
    }
}

impl From<io::Error> for AnsiError {
    fn from(_: io::Error) -> Self {
        AnsiError::WriteFailed
    }
}

pub struct ANSI;

impl ANSI {
    pub const RESET: &'static str = "\x1b[0m";
    pub const CLEAR: &'static str = "\x1b[2J";
    pub const HOME: &'static str = "\x1b[H";
    pub const CLEAR_AND_HOME: &'static str = "\x1b[H\x1b[2J";
    pub const HIDE_CURSOR: &'static str = "\x1b[?25l";
    pub const SHOW_CURSOR: &'static str = "\x1b[?25h";
    pub const DEFAULT_CURSOR_STYLE: &'static str = "\x1b[0 q";
    
    // Text attribute constants
    pub const BOLD: &'static str = "\x1b[1m";
    pub const DIM: &'static str = "\x1b[2m";
    pub const ITALIC: &'static str = "\x1b[3m";
    pub const UNDERLINE: &'static str = "\x1b[4m";
    pub const BLINK: &'static str = "\x1b[5m";
    pub const INVERSE: &'static str = "\x1b[7m";
    pub const HIDDEN: &'static str = "\x1b[8m";
    pub const STRIKETHROUGH: &'static str = "\x1b[9m";
    
    // Cursor styles
    pub const CURSOR_BLOCK: &'static str = "\x1b[2 q";
    pub const CURSOR_BLOCK_BLINK: &'static str = "\x1b[1 q";
    pub const CURSOR_LINE: &'static str = "\x1b[6 q";
    pub const CURSOR_LINE_BLINK: &'static str = "\x1b[5 q";
    pub const CURSOR_UNDERLINE: &'static str = "\x1b[4 q";
    pub const CURSOR_UNDERLINE_BLINK: &'static str = "\x1b[3 q";
    
    pub const RESET_CURSOR_COLOR: &'static str = "\x1b]12;default\x07";
    pub const SAVE_CURSOR_STATE: &'static str = "\x1b[s";
    pub const RESTORE_CURSOR_STATE: &'static str = "\x1b[u";
    
    // Screen switching
    pub const SWITCH_TO_ALTERNATE_SCREEN: &'static str = "\x1b[?1049h";
    pub const SWITCH_TO_MAIN_SCREEN: &'static str = "\x1b[?1049l";
    
    // Mouse tracking
    pub const ENABLE_MOUSE_TRACKING: &'static str = "\x1b[?1000h";
    pub const DISABLE_MOUSE_TRACKING: &'static str = "\x1b[?1000l";
    pub const ENABLE_BUTTON_EVENT_TRACKING: &'static str = "\x1b[?1002h";
    pub const DISABLE_BUTTON_EVENT_TRACKING: &'static str = "\x1b[?1002l";
    pub const ENABLE_ANY_EVENT_TRACKING: &'static str = "\x1b[?1003h";
    pub const DISABLE_ANY_EVENT_TRACKING: &'static str = "\x1b[?1003l";
    pub const ENABLE_SGR_MOUSE_MODE: &'static str = "\x1b[?1006h";
    pub const DISABLE_SGR_MOUSE_MODE: &'static str = "\x1b[?1006l";
    
    pub fn move_to_output<W: Write>(writer: &mut W, x: u32, y: u32) -> Result<(), AnsiError> {
        write!(writer, "\x1b[{};{}H", y, x)?;
        Ok(())
    }
    
    pub fn fg_color_output<W: Write>(writer: &mut W, r: u8, g: u8, b: u8) -> Result<(), AnsiError> {
        write!(writer, "\x1b[38;2;{};{};{}m", r, g, b)?;
        Ok(())
    }
    
    pub fn bg_color_output<W: Write>(writer: &mut W, r: u8, g: u8, b: u8) -> Result<(), AnsiError> {
        write!(writer, "\x1b[48;2;{};{};{}m", r, g, b)?;
        Ok(())
    }
    
    pub fn cursor_color_output_writer<W: Write>(writer: &mut W, r: u8, g: u8, b: u8) -> Result<(), AnsiError> {
        write!(writer, "\x1b]12;#{:02x}{:02x}{:02x}\x07", r, g, b)?;
        Ok(())
    }
    
    pub fn clear_renderer_space_output<W: Write>(writer: &mut W, height: u32) -> Result<(), AnsiError> {
        // Clear each line individually from bottom to top
        for i in (1..=height).rev() {
            write!(writer, "\x1b[{};1H\x1b[2K", i)?;
        }
        Ok(())
    }
}

pub struct TextAttributes;

impl TextAttributes {
    pub const NONE: u8 = 0;
    pub const BOLD: u8 = 1 << 0;
    pub const DIM: u8 = 1 << 1;
    pub const ITALIC: u8 = 1 << 2;
    pub const UNDERLINE: u8 = 1 << 3;
    pub const BLINK: u8 = 1 << 4;
    pub const INVERSE: u8 = 1 << 5;
    pub const HIDDEN: u8 = 1 << 6;
    pub const STRIKETHROUGH: u8 = 1 << 7;
    
    pub fn apply_attributes_output_writer<W: io::Write>(writer: &mut W, attributes: u8) -> Result<(), AnsiError> {
        if attributes & Self::BOLD != 0 {
            writer.write_all(ANSI::BOLD.as_bytes())?;
        }
        if attributes & Self::DIM != 0 {
            writer.write_all(ANSI::DIM.as_bytes())?;
        }
        if attributes & Self::ITALIC != 0 {
            writer.write_all(ANSI::ITALIC.as_bytes())?;
        }
        if attributes & Self::UNDERLINE != 0 {
            writer.write_all(ANSI::UNDERLINE.as_bytes())?;
        }
        if attributes & Self::BLINK != 0 {
            writer.write_all(ANSI::BLINK.as_bytes())?;
        }
        if attributes & Self::INVERSE != 0 {
            writer.write_all(ANSI::INVERSE.as_bytes())?;
        }
        if attributes & Self::HIDDEN != 0 {
            writer.write_all(ANSI::HIDDEN.as_bytes())?;
        }
        if attributes & Self::STRIKETHROUGH != 0 {
            writer.write_all(ANSI::STRIKETHROUGH.as_bytes())?;
        }
        Ok(())
    }
}

const HSV_SECTOR_COUNT: u8 = 6;
const HUE_SECTOR_DEGREES: f32 = 60.0;

pub fn hsv_to_rgb(h: f32, s: f32, v: f32) -> RGBA {
    let clamped_h = h % 360.0;
    let clamped_s = s.clamp(0.0, 1.0);
    let clamped_v = v.clamp(0.0, 1.0);
    
    let sector = ((clamped_h / HUE_SECTOR_DEGREES).floor() as u8) % HSV_SECTOR_COUNT;
    let fractional = clamped_h / HUE_SECTOR_DEGREES - (clamped_h / HUE_SECTOR_DEGREES).floor();
    
    let p = clamped_v * (1.0 - clamped_s);
    let q = clamped_v * (1.0 - fractional * clamped_s);
    let t = clamped_v * (1.0 - (1.0 - fractional) * clamped_s);
    
    let (r, g, b) = match sector {
        0 => (clamped_v, t, p),
        1 => (q, clamped_v, p),
        2 => (p, clamped_v, t),
        3 => (p, q, clamped_v),
        4 => (t, p, clamped_v),
        5 => (clamped_v, p, q),
        _ => unreachable!(),
    };
    
    [r, g, b, 1.0]
}