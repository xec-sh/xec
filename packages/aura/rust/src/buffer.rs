use crate::ansi;
use crate::text_buffer::TextBuffer;
use std::cmp::{max, min};
use std::ptr;

pub type RGBA = ansi::RGBA;
pub type Vec3f = [f32; 3];
pub type Vec4f = [f32; 4];

const INV_255: f32 = 1.0 / 255.0;
const DEFAULT_SPACE_CHAR: u32 = 32;
const MAX_UNICODE_CODEPOINT: u32 = 0x10FFFF;
const BLOCK_CHAR: u32 = 0x2588; // Full block █
// Removed unused QUADRANT_CHARS_COUNT and ALPHA_LUT

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct BorderSides {
    pub top: bool,
    pub right: bool,
    pub bottom: bool,
    pub left: bool,
}

#[repr(u8)]
#[derive(Debug, Clone, Copy)]
pub enum BorderCharIndex {
    TopLeft = 0,
    TopRight = 1,
    BottomLeft = 2,
    BottomRight = 3,
    Horizontal = 4,
    Vertical = 5,
    TopT = 6,
    BottomT = 7,
    LeftT = 8,
    RightT = 9,
    Cross = 10,
}

#[derive(Debug, Clone)]
pub struct TextSelection {
    pub start: u32,
    pub end: u32,
    pub bgColor: Option<RGBA>,
    pub fgColor: Option<RGBA>,
}

#[derive(Debug, Clone)]
pub struct ClipRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug)]
pub enum BufferError {
    OutOfMemory,
    InvalidDimensions,
    InvalidUnicode,
    BufferTooSmall,
}

#[inline(always)]
pub fn rgba_to_vec4f(color: RGBA) -> Vec4f {
    color  // No conversion needed, already same type
}

#[inline(always)]
pub fn rgba_equal(a: RGBA, b: RGBA, epsilon: f32) -> bool {
    // Safe version without unnecessary unsafe
    (a[0] - b[0]).abs() < epsilon &&
    (a[1] - b[1]).abs() < epsilon &&
    (a[2] - b[2]).abs() < epsilon &&
    (a[3] - b[3]).abs() < epsilon
}

#[derive(Debug, Clone)]
pub struct Cell {
    pub char: u32,
    pub fg: RGBA,
    pub bg: RGBA,
    pub attributes: u8,
}

fn is_rgba_with_alpha(color: RGBA) -> bool {
    color[3] < 1.0
}

#[inline(always)]
fn blend_colors(overlay: RGBA, text: RGBA) -> RGBA {
    // Fast path for opaque colors (matching Zig implementation)
    if overlay[3] >= 0.999 {
        return overlay;
    }
    
    let alpha = overlay[3];
    let perceptual_alpha = if alpha > 0.8 {
        let normalized_high_alpha = (alpha - 0.8) * 5.0;
        let curved_high_alpha = normalized_high_alpha.powf(0.2);
        0.8 + (curved_high_alpha * 0.2)
    } else {
        alpha.powf(0.9)
    };
    
    let inv_alpha = 1.0 - perceptual_alpha;
    
    // Blend RGB components
    [
        overlay[0] * perceptual_alpha + text[0] * inv_alpha,
        overlay[1] * perceptual_alpha + text[1] * inv_alpha,
        overlay[2] * perceptual_alpha + text[2] * inv_alpha,
        text[3]  // Preserve text alpha
    ]
}

/// Optimized buffer for terminal rendering
pub struct OptimizedBuffer {
    buffer: BufferData,
    pub width: u32,
    pub height: u32,
    respect_alpha: bool,
}

struct BufferData {
    char: Vec<u32>,
    fg: Vec<RGBA>,
    bg: Vec<RGBA>,
    attributes: Vec<u8>,
}

pub struct InitOptions {
    pub respect_alpha: bool,
}

impl Default for InitOptions {
    fn default() -> Self {
        InitOptions {
            respect_alpha: false,  // Default to false to match Zig behavior
        }
    }
}

impl OptimizedBuffer {
    pub fn init(width: u32, height: u32, options: InitOptions) -> Result<Box<OptimizedBuffer>, BufferError> {
        if width == 0 || height == 0 {
            return Err(BufferError::InvalidDimensions);
        }
        
        let size = (width * height) as usize;
        
        let buffer_data = BufferData {
            char: vec![DEFAULT_SPACE_CHAR; size],
            fg: vec![[1.0, 1.0, 1.0, 1.0]; size],  // Default white foreground
            bg: vec![[0.0, 0.0, 0.0, 1.0]; size],  // Default opaque black background
            attributes: vec![0; size],
        };
        
        Ok(Box::new(OptimizedBuffer {
            buffer: buffer_data,
            width,
            height,
            respect_alpha: options.respect_alpha,
        }))
    }
    
    pub fn deinit(self: Box<Self>) {
        // Rust automatically handles memory deallocation
        drop(self);
    }
    
    pub fn get_char_ptr(&mut self) -> *mut u32 {
        self.buffer.char.as_mut_ptr()
    }
    
    pub fn get_fg_ptr(&mut self) -> *mut RGBA {
        self.buffer.fg.as_mut_ptr()
    }
    
    pub fn get_bg_ptr(&mut self) -> *mut RGBA {
        self.buffer.bg.as_mut_ptr()
    }
    
    pub fn get_attributes_ptr(&mut self) -> *mut u8 {
        self.buffer.attributes.as_mut_ptr()
    }
    
    pub fn get_width(&self) -> u32 {
        self.width
    }
    
    pub fn get_height(&self) -> u32 {
        self.height
    }
    
    pub fn get_respect_alpha(&self) -> bool {
        self.respect_alpha
    }
    
    pub fn set_respect_alpha(&mut self, respect_alpha: bool) {
        self.respect_alpha = respect_alpha;
    }
    
    pub fn clear(&mut self, bg: RGBA, char: Option<u32>) -> Result<(), BufferError> {
        let fill_char = char.unwrap_or(DEFAULT_SPACE_CHAR);
        
        
        // Optimized clear using slice fill
        self.buffer.char.fill(fill_char);
        self.buffer.fg.fill([1.0, 1.0, 1.0, 1.0]);
        self.buffer.bg.fill(bg);
        self.buffer.attributes.fill(0);
        
        Ok(())
    }
    
    #[inline(always)]
    pub fn get(&self, x: u32, y: u32) -> Option<Cell> {
        if x >= self.width || y >= self.height {
            return None;
        }
        
        let index = (y * self.width + x) as usize;
        unsafe {
            // Skip bounds check since we already validated
            Some(Cell {
                char: *self.buffer.char.get_unchecked(index),
                fg: *self.buffer.fg.get_unchecked(index),
                bg: *self.buffer.bg.get_unchecked(index),
                attributes: *self.buffer.attributes.get_unchecked(index),
            })
        }
    }
    
    #[inline(always)]
    pub fn set(&mut self, x: u32, y: u32, cell: Cell) {
        if x >= self.width || y >= self.height {
            return;
        }
        
        let index = (y * self.width + x) as usize;
        unsafe {
            // Skip bounds check since we already validated
            *self.buffer.char.get_unchecked_mut(index) = cell.char;
            *self.buffer.fg.get_unchecked_mut(index) = cell.fg;
            *self.buffer.bg.get_unchecked_mut(index) = cell.bg;
            *self.buffer.attributes.get_unchecked_mut(index) = cell.attributes;
        }
    }
    
    #[inline(always)]
    pub fn set_cell(&mut self, x: u32, y: u32, char: u32, fg: RGBA, bg: RGBA, attributes: u8) -> Result<(), BufferError> {
        if x >= self.width || y >= self.height {
            return Ok(());
        }
        
        let index = (y * self.width + x) as usize;
        unsafe {
            *self.buffer.char.get_unchecked_mut(index) = char;
            *self.buffer.fg.get_unchecked_mut(index) = fg;
            *self.buffer.bg.get_unchecked_mut(index) = bg;
            *self.buffer.attributes.get_unchecked_mut(index) = attributes;
        }
        
        Ok(())
    }
    
    pub fn set_cell_with_alpha_blending(&mut self, x: u32, y: u32, char: u32, fg: RGBA, bg: RGBA, attributes: u8) -> Result<(), BufferError> {
        let has_bg_alpha = is_rgba_with_alpha(bg);
        let has_fg_alpha = is_rgba_with_alpha(fg);
        
        if has_bg_alpha || has_fg_alpha {
            if let Some(dest_cell) = self.get(x, y) {
                let blended_bg_rgb = if has_bg_alpha {
                    blend_colors(bg, dest_cell.bg)
                } else {
                    bg
                };
                
                // Preserve destination character if overlay is just a space with alpha
                let preserve_char = char == DEFAULT_SPACE_CHAR && dest_cell.char != 0 && dest_cell.char != DEFAULT_SPACE_CHAR;
                let final_char = if preserve_char { dest_cell.char } else { char };
                
                let final_fg = if preserve_char {
                    // Blend foregrounds as well if preserving character
                    blend_colors(bg, dest_cell.fg)
                } else {
                    if has_fg_alpha {
                        blend_colors(fg, dest_cell.bg)
                    } else {
                        fg
                    }
                };
                
                let final_attributes = if preserve_char { dest_cell.attributes } else { attributes };
                
                // Create the final cell, preserving the overlay alpha (bg[3])
                let final_bg = [blended_bg_rgb[0], blended_bg_rgb[1], blended_bg_rgb[2], bg[3]];
                
                self.set(x, y, Cell {
                    char: final_char,
                    fg: final_fg,
                    bg: final_bg,
                    attributes: final_attributes,
                });
                return Ok(());
            }
        }
        
        // No alpha blending needed
        self.set(x, y, Cell {
            char,
            fg,
            bg,
            attributes,
        });
        Ok(())
    }
    
    pub fn draw_text(&mut self, text: &str, x: u32, y: u32, fg: RGBA, bg: Option<RGBA>, attributes: u8) -> Result<(), BufferError> {
        if x >= self.width || y >= self.height || text.is_empty() {
            return Ok(());
        }
        
        let max_chars = (self.width - x) as usize;
        let curr_y = y;
        
        // Check if we need alpha blending
        let needs_alpha_blending = bg.map_or(false, |bg_color| is_rgba_with_alpha(bg_color));
        
        if needs_alpha_blending {
            // Use alpha blending for each character
            let mut curr_x = x;
            for ch in text.chars() {
                if curr_x >= self.width {
                    break;
                }
                
                let char_code = ch as u32;
                self.set_cell_with_alpha_blending(
                    curr_x, 
                    curr_y, 
                    char_code,
                    fg,
                    bg.unwrap_or([0.0, 0.0, 0.0, 0.0]),
                    attributes
                )?;
                
                curr_x += 1;
            }
        } else {
            // Fast path without alpha blending
            let row_start = (curr_y * self.width) as usize;
            
            if text.is_ascii() {
                let bytes = text.as_bytes();
                let to_draw = bytes.len().min(max_chars);
                
                unsafe {
                    let char_ptr = self.buffer.char.as_mut_ptr().add(row_start + x as usize);
                    let fg_ptr = self.buffer.fg.as_mut_ptr().add(row_start + x as usize);
                    let bg_ptr = self.buffer.bg.as_mut_ptr().add(row_start + x as usize);
                    let attr_ptr = self.buffer.attributes.as_mut_ptr().add(row_start + x as usize);
                    
                    if let Some(bg_color) = bg {
                        // With explicit background
                        for (i, &byte) in bytes[..to_draw].iter().enumerate() {
                            ptr::write(char_ptr.add(i), byte as u32);
                            ptr::write(fg_ptr.add(i), fg);
                            ptr::write(bg_ptr.add(i), bg_color);
                            ptr::write(attr_ptr.add(i), attributes);
                        }
                    } else {
                        // Preserve existing backgrounds - optimized path
                        // Write characters and foreground in batch
                        for (i, &byte) in bytes[..to_draw].iter().enumerate() {
                            ptr::write(char_ptr.add(i), byte as u32);
                            ptr::write(fg_ptr.add(i), fg);
                            // Skip bg write - preserve existing
                            ptr::write(attr_ptr.add(i), attributes);
                        }
                    }
                }
            } else {
                // UTF-8 path
                let mut curr_x = x;
                for ch in text.chars() {
                    if curr_x >= self.width {
                        break;
                    }
                    
                    let char_code = ch as u32;
                    let index = (curr_y * self.width + curr_x) as usize;
                    
                    unsafe {
                        *self.buffer.char.get_unchecked_mut(index) = char_code;
                        *self.buffer.fg.get_unchecked_mut(index) = fg;
                        if let Some(bg_color) = bg {
                            *self.buffer.bg.get_unchecked_mut(index) = bg_color;
                        }
                        *self.buffer.attributes.get_unchecked_mut(index) = attributes;
                    }
                    
                    curr_x += 1;
                }
            }
        }
        
        Ok(())
    }
    
    pub fn fill_rect(&mut self, x: u32, y: u32, width: u32, height: u32, bg: RGBA) -> Result<(), BufferError> {
        if self.width == 0 || self.height == 0 || width == 0 || height == 0 {
            return Ok(());
        }
        if x >= self.width || y >= self.height {
            return Ok(());
        }
        
        let x_start = x;
        let y_start = y;
        let x_end = (x + width).min(self.width);
        let y_end = (y + height).min(self.height);
        
        let has_alpha = is_rgba_with_alpha(bg);
        
        if has_alpha {
            // Use alpha blending for each cell
            for curr_y in y_start..y_end {
                for curr_x in x_start..x_end {
                    self.set_cell_with_alpha_blending(curr_x, curr_y, DEFAULT_SPACE_CHAR, 
                                                     [1.0, 1.0, 1.0, 1.0], bg, 0)?;
                }
            }
        } else {
            // Fast path for opaque backgrounds - optimized fill
            let default_fg = [1.0, 1.0, 1.0, 1.0];
            
            unsafe {
                for curr_y in y_start..y_end {
                    let row_start = (curr_y * self.width + x_start) as usize;
                    let _row_end = row_start + (x_end - x_start) as usize;
                    
                    // Use ptr operations for better performance
                    let char_ptr = self.buffer.char.as_mut_ptr().add(row_start);
                    let fg_ptr = self.buffer.fg.as_mut_ptr().add(row_start);
                    let bg_ptr = self.buffer.bg.as_mut_ptr().add(row_start);
                    let attr_ptr = self.buffer.attributes.as_mut_ptr().add(row_start);
                    
                    for i in 0..(x_end - x_start) as usize {
                        ptr::write(char_ptr.add(i), DEFAULT_SPACE_CHAR);
                        ptr::write(fg_ptr.add(i), default_fg);
                        ptr::write(bg_ptr.add(i), bg);
                        ptr::write(attr_ptr.add(i), 0);
                    }
                }
            }
        }
        
        Ok(())
    }
    
    pub fn draw_frame_buffer(&mut self, dest_x: i32, dest_y: i32, source: &OptimizedBuffer, 
                            src_x: Option<u32>, src_y: Option<u32>, 
                            src_width: Option<u32>, src_height: Option<u32>) {
        if self.width == 0 || self.height == 0 || source.width == 0 || source.height == 0 {
            return;
        }
        
        let src_x = src_x.unwrap_or(0);
        let src_y = src_y.unwrap_or(0);
        let src_width = src_width.unwrap_or(source.width);
        let src_height = src_height.unwrap_or(source.height);
        
        if src_x >= source.width || src_y >= source.height {
            return;
        }
        if src_width == 0 || src_height == 0 {
            return;
        }
        
        let clamped_src_width = (src_width).min(source.width - src_x);
        let clamped_src_height = (src_height).min(source.height - src_y);
        
        let start_dest_x = max(0, dest_x);
        let start_dest_y = max(0, dest_y);
        let end_dest_x = min(self.width as i32 - 1, dest_x + clamped_src_width as i32 - 1);
        let end_dest_y = min(self.height as i32 - 1, dest_y + clamped_src_height as i32 - 1);
        
        if start_dest_x > end_dest_x || start_dest_y > end_dest_y {
            return;
        }
        
        // Check if source buffer uses alpha blending
        if !source.respect_alpha {
            // Fast path: direct memory copy
            for d_y in start_dest_y..=end_dest_y {
                let relative_dest_y = d_y - dest_y;
                let s_y = src_y + relative_dest_y as u32;
                
                if s_y >= source.height {
                    continue;
                }
                
                let relative_dest_x = start_dest_x - dest_x;
                let s_x = src_x + relative_dest_x as u32;
                
                if s_x >= source.width {
                    continue;
                }
                
                let copy_width = ((end_dest_x - start_dest_x + 1) as u32).min(source.width - s_x);
                
                for i in 0..copy_width {
                    let dest_idx = (d_y as u32 * self.width + start_dest_x as u32 + i) as usize;
                    let src_idx = (s_y * source.width + s_x + i) as usize;
                    
                    self.buffer.char[dest_idx] = source.buffer.char[src_idx];
                    self.buffer.fg[dest_idx] = source.buffer.fg[src_idx];
                    self.buffer.bg[dest_idx] = source.buffer.bg[src_idx];
                    self.buffer.attributes[dest_idx] = source.buffer.attributes[src_idx];
                }
            }
        } else {
            // Slow path: process cells individually with alpha blending
            for d_y in start_dest_y..=end_dest_y {
                for d_x in start_dest_x..=end_dest_x {
                    let relative_dest_x = d_x - dest_x;
                    let relative_dest_y = d_y - dest_y;
                    let s_x = src_x + relative_dest_x as u32;
                    let s_y = src_y + relative_dest_y as u32;
                    
                    if s_x >= source.width || s_y >= source.height {
                        continue;
                    }
                    
                    let src_index = (s_y * source.width + s_x) as usize;
                    if src_index >= source.buffer.char.len() {
                        continue;
                    }
                    
                    // Skip fully transparent cells
                    if source.buffer.bg[src_index][3] == 0.0 && source.buffer.fg[src_index][3] == 0.0 {
                        continue;
                    }
                    
                    self.set_cell_with_alpha_blending(
                        d_x as u32, 
                        d_y as u32, 
                        source.buffer.char[src_index],
                        source.buffer.fg[src_index],
                        source.buffer.bg[src_index],
                        source.buffer.attributes[src_index]
                    ).ok();
                }
            }
        }
    }
    
    pub fn draw_box(&mut self, x: i32, y: i32, width: u32, height: u32,
                   border_chars: &[u32], border_sides: BorderSides,
                   border_color: RGBA, background_color: RGBA,
                   should_fill: bool, title: Option<&str>, title_alignment: u8) -> Result<(), BufferError> {
        let start_x = max(0, x);
        let start_y = max(0, y);
        let end_x = min(self.width as i32 - 1, x + width as i32 - 1);
        let end_y = min(self.height as i32 - 1, y + height as i32 - 1);
        
        if start_x > end_x || start_y > end_y {
            return Ok(());
        }
        
        let is_at_actual_left = start_x == x;
        let is_at_actual_right = end_x == x + width as i32 - 1;
        let is_at_actual_top = start_y == y;
        let is_at_actual_bottom = end_y == y + height as i32 - 1;
        
        // Fill background if requested
        if should_fill {
            if !border_sides.top && !border_sides.right && !border_sides.bottom && !border_sides.left {
                // No borders, fill entire area
                let fill_width = (end_x - start_x + 1) as u32;
                let fill_height = (end_y - start_y + 1) as u32;
                self.fill_rect(start_x as u32, start_y as u32, fill_width, fill_height, background_color)?;
            } else {
                // Fill inner area only
                let inner_start_x = start_x + if border_sides.left && is_at_actual_left { 1 } else { 0 };
                let inner_start_y = start_y + if border_sides.top && is_at_actual_top { 1 } else { 0 };
                let inner_end_x = end_x - if border_sides.right && is_at_actual_right { 1 } else { 0 };
                let inner_end_y = end_y - if border_sides.bottom && is_at_actual_bottom { 1 } else { 0 };
                
                if inner_end_x >= inner_start_x && inner_end_y >= inner_start_y {
                    let fill_width = (inner_end_x - inner_start_x + 1) as u32;
                    let fill_height = (inner_end_y - inner_start_y + 1) as u32;
                    self.fill_rect(inner_start_x as u32, inner_start_y as u32, fill_width, fill_height, background_color)?;
                }
            }
        }
        
        // Calculate title position if provided
        let mut should_draw_title = false;
        let mut title_start_x = 0i32;
        let mut title_end_x = 0i32;
        
        if let Some(title_text) = title {
            if !title_text.is_empty() && border_sides.top && is_at_actual_top {
                let title_length = title_text.chars().count() as i32;
                let min_title_space = 4;
                
                should_draw_title = width as i32 >= title_length + min_title_space;
                
                if should_draw_title {
                    let padding = 2;
                    
                    let title_x = match title_alignment {
                        1 => start_x + max(padding, (width as i32 - title_length) / 2), // Center
                        2 => start_x + width as i32 - padding - title_length, // Right
                        _ => start_x + padding, // Left
                    };
                    
                    let title_x = max(start_x + padding, min(title_x, end_x - title_length));
                    title_start_x = title_x;
                    title_end_x = title_x + title_length - 1;
                }
            }
        }
        
        // Draw horizontal borders
        if border_sides.top || border_sides.bottom {
            // Draw top border
            if border_sides.top && is_at_actual_top {
                for draw_x in start_x..=end_x {
                    if start_y >= 0 && start_y < self.height as i32 {
                        // Skip drawing border where title will be
                        if should_draw_title && draw_x >= title_start_x && draw_x <= title_end_x {
                            continue;
                        }
                        
                        let mut char = border_chars[BorderCharIndex::Horizontal as usize];
                        
                        // Handle corners
                        if draw_x == start_x && is_at_actual_left {
                            char = if border_sides.left {
                                border_chars[BorderCharIndex::TopLeft as usize]
                            } else {
                                border_chars[BorderCharIndex::Horizontal as usize]
                            };
                        } else if draw_x == end_x && is_at_actual_right {
                            char = if border_sides.right {
                                border_chars[BorderCharIndex::TopRight as usize]
                            } else {
                                border_chars[BorderCharIndex::Horizontal as usize]
                            };
                        }
                        
                        // Use the provided background color for border
                        self.set_cell_with_alpha_blending(draw_x as u32, start_y as u32, char, 
                                                         border_color, background_color, 0)?;
                    }
                }
            }
            
            // Draw bottom border
            if border_sides.bottom && is_at_actual_bottom {
                for draw_x in start_x..=end_x {
                    if end_y >= 0 && end_y < self.height as i32 {
                        let mut char = border_chars[BorderCharIndex::Horizontal as usize];
                        
                        // Handle corners
                        if draw_x == start_x && is_at_actual_left {
                            char = if border_sides.left {
                                border_chars[BorderCharIndex::BottomLeft as usize]
                            } else {
                                border_chars[BorderCharIndex::Horizontal as usize]
                            };
                        } else if draw_x == end_x && is_at_actual_right {
                            char = if border_sides.right {
                                border_chars[BorderCharIndex::BottomRight as usize]
                            } else {
                                border_chars[BorderCharIndex::Horizontal as usize]
                            };
                        }
                        
                        // Use the provided background color for border
                        self.set_cell_with_alpha_blending(draw_x as u32, end_y as u32, char,
                                                         border_color, background_color, 0)?;
                    }
                }
            }
        }
        
        // Special cases for extending vertical borders
        let left_border_only = border_sides.left && is_at_actual_left && !border_sides.top && !border_sides.bottom;
        let right_border_only = border_sides.right && is_at_actual_right && !border_sides.top && !border_sides.bottom;
        let bottom_only_with_verticals = border_sides.bottom && is_at_actual_bottom && !border_sides.top && (border_sides.left || border_sides.right);
        let top_only_with_verticals = border_sides.top && is_at_actual_top && !border_sides.bottom && (border_sides.left || border_sides.right);
        
        let extend_verticals_to_top = left_border_only || right_border_only || bottom_only_with_verticals;
        let extend_verticals_to_bottom = left_border_only || right_border_only || top_only_with_verticals;
        
        // Draw vertical borders
        let vertical_start_y = if extend_verticals_to_top {
            start_y
        } else {
            start_y + if border_sides.top && is_at_actual_top { 1 } else { 0 }
        };
        let vertical_end_y = if extend_verticals_to_bottom {
            end_y
        } else {
            end_y - if border_sides.bottom && is_at_actual_bottom { 1 } else { 0 }
        };
        
        if border_sides.left || border_sides.right {
            for draw_y in vertical_start_y..=vertical_end_y {
                // Left border
                if border_sides.left && is_at_actual_left && start_x >= 0 && start_x < self.width as i32 {
                    // Use the provided background color for border
                    self.set_cell_with_alpha_blending(start_x as u32, draw_y as u32, 
                                                     border_chars[BorderCharIndex::Vertical as usize],
                                                     border_color, background_color, 0)?;
                }
                
                // Right border
                if border_sides.right && is_at_actual_right && end_x >= 0 && end_x < self.width as i32 {
                    // Use the provided background color for border
                    self.set_cell_with_alpha_blending(end_x as u32, draw_y as u32,
                                                     border_chars[BorderCharIndex::Vertical as usize],
                                                     border_color, background_color, 0)?;
                }
            }
        }
        
        // Draw title if calculated earlier
        if should_draw_title {
            if let Some(title_text) = title {
                // Pass the background color to match the box background
                self.draw_text(title_text, title_start_x as u32, start_y as u32, border_color, Some(background_color), 0)?;
            }
        }
        
        Ok(())
    }
    
    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), BufferError> {
        if width == 0 || height == 0 {
            return Err(BufferError::InvalidDimensions);
        }
        
        let new_size = (width * height) as usize;
        let old_width = self.width;
        let old_height = self.height;
        
        // Create new buffers
        let mut new_char = vec![0u32; new_size];
        let mut new_fg = vec![[0.0, 0.0, 0.0, 0.0]; new_size];
        let mut new_bg = vec![[0.0, 0.0, 0.0, 0.0]; new_size];
        let mut new_attributes = vec![0u8; new_size];
        
        // Copy existing data
        let copy_width = width.min(old_width);
        let copy_height = height.min(old_height);
        
        for y in 0..copy_height {
            for x in 0..copy_width {
                let old_index = (y * old_width + x) as usize;
                let new_index = (y * width + x) as usize;
                
                new_char[new_index] = self.buffer.char[old_index];
                new_fg[new_index] = self.buffer.fg[old_index];
                new_bg[new_index] = self.buffer.bg[old_index];
                new_attributes[new_index] = self.buffer.attributes[old_index];
            }
        }
        
        self.buffer.char = new_char;
        self.buffer.fg = new_fg;
        self.buffer.bg = new_bg;
        self.buffer.attributes = new_attributes;
        self.width = width;
        self.height = height;
        
        Ok(())
    }
    
    pub fn draw_text_buffer(&mut self, text_buffer: &TextBuffer, x: i32, y: i32, clip_rect: Option<ClipRect>) -> Result<(), BufferError> {
        let mut current_x = x;
        let mut current_y = y;
        
        // Use the existing methods available in TextBuffer
        let length = text_buffer.get_length() as usize;
        
        // Get raw pointers (unsafe but matching Zig implementation)
        let tb_chars = unsafe { std::slice::from_raw_parts(text_buffer.get_char_ptr_const(), length) };
        let tb_fgs = unsafe { std::slice::from_raw_parts(text_buffer.get_fg_ptr_const(), length) };
        let tb_bgs = unsafe { std::slice::from_raw_parts(text_buffer.get_bg_ptr_const(), length) };
        let tb_attrs = unsafe { std::slice::from_raw_parts(text_buffer.get_attributes_ptr_const(), length) };
        
        let selection = text_buffer.get_selection();
        
        // Import constants from text_buffer module
        use crate::text_buffer::{USE_DEFAULT_FG, USE_DEFAULT_BG, USE_DEFAULT_ATTR, ATTR_MASK};
        
        // Iterate through all characters in the text buffer
        for i in 0..length {
            let char_code = tb_chars[i];
            
            // Handle newline
            if char_code == b'\n' as u32 {
                current_y += 1;
                current_x = x;
                continue;
            }
            
            if current_x < 0 || current_y < 0 {
                current_x += 1;
                continue;
            }
            if current_x >= self.width as i32 || current_y >= self.height as i32 {
                current_x += 1;
                continue;
            }
            
            // Check clip rect if provided
            if let Some(ref clip) = clip_rect {
                if current_x < clip.x || current_y < clip.y ||
                   current_x >= clip.x + clip.width as i32 ||
                   current_y >= clip.y + clip.height as i32 
                {
                    current_x += 1;
                    continue;
                }
            }
            
            let mut fg = tb_fgs[i];
            let mut bg = tb_bgs[i];
            let attributes_raw = tb_attrs[i];
            
            // Handle default values like Zig version
            if attributes_raw & USE_DEFAULT_FG != 0 {
                if let Some(def_fg) = text_buffer.get_default_fg() {
                    fg = def_fg;
                }
            }
            
            if attributes_raw & USE_DEFAULT_BG != 0 {
                if let Some(def_bg) = text_buffer.get_default_bg() {
                    bg = def_bg;
                }
            }
            
            let mut attributes = (attributes_raw & ATTR_MASK) as u8;
            if attributes_raw & USE_DEFAULT_ATTR != 0 {
                if let Some(def_attr) = text_buffer.get_default_attributes() {
                    attributes = def_attr;
                }
            }
            
            // Apply selection
            if let Some(ref sel) = selection {
                let is_selected = i as u32 >= sel.start && (i as u32) < sel.end;
                if is_selected {
                    if let Some(sel_bg) = sel.bgColor {
                        bg = sel_bg;
                        if let Some(sel_fg) = sel.fgColor {
                            fg = sel_fg;
                        }
                    } else {
                        // Swap fg and bg for default selection style
                        let temp = fg;
                        fg = if bg[3] > 0.0 { bg } else { [0.0, 0.0, 0.0, 1.0] };
                        bg = temp;
                    }
                }
            }
            
            // Handle reverse attribute (bit 5)
            if attributes & (1 << 5) != 0 {
                let temp = fg;
                fg = bg;
                bg = temp;
            }
            
            self.set_cell_with_alpha_blending(
                current_x as u32,
                current_y as u32,
                char_code,
                fg,
                bg,
                attributes,
            )?;
            
            current_x += 1;
        }
        
        Ok(())
    }
    
    pub fn draw_packed_buffer(&mut self, data: &[u8], data_len: usize, pos_x: u32, pos_y: u32, 
                             terminal_width_cells: u32, terminal_height_cells: u32) {
        const CELL_RESULT_SIZE: usize = 48;
        let num_cells = data_len / CELL_RESULT_SIZE;
        let buffer_width_cells = terminal_width_cells;
        
        for i in 0..num_cells {
            let cell_data_offset = i * CELL_RESULT_SIZE;
            
            let cell_x = pos_x + (i as u32 % buffer_width_cells);
            let cell_y = pos_y + (i as u32 / buffer_width_cells);
            
            if cell_x >= terminal_width_cells || cell_y >= terminal_height_cells {
                continue;
            }
            if cell_x >= self.width || cell_y >= self.height {
                continue;
            }
            
            // Extract background color (16 bytes)
            let bg_ptr = unsafe { &*(data.as_ptr().add(cell_data_offset) as *const [f32; 4]) };
            let bg: RGBA = [bg_ptr[0], bg_ptr[1], bg_ptr[2], bg_ptr[3]];
            
            // Extract foreground color (16 bytes)
            let fg_ptr = unsafe { &*(data.as_ptr().add(cell_data_offset + 16) as *const [f32; 4]) };
            let fg: RGBA = [fg_ptr[0], fg_ptr[1], fg_ptr[2], fg_ptr[3]];
            
            // Extract character (4 bytes)
            let char_ptr = unsafe { &*(data.as_ptr().add(cell_data_offset + 32) as *const u32) };
            let mut char = *char_ptr;
            
            if char == 0 || char > MAX_UNICODE_CODEPOINT {
                char = DEFAULT_SPACE_CHAR;
            }
            
            if char < 32 || (char > 126 && char < 0x2580) {
                char = BLOCK_CHAR;
            }
            
            let _ = self.set_cell_with_alpha_blending(cell_x, cell_y, char, fg, bg, 0);
        }
    }
    
    pub fn draw_super_sample_buffer(&mut self, pos_x: u32, pos_y: u32, pixel_data: &[u8], len: usize, 
                                   format: u8, aligned_bytes_per_row: u32) -> Result<(), BufferError> {
        const BYTES_PER_PIXEL: usize = 4;
        let is_bgra = format == 0;
        
        let mut y_cell = pos_y;
        while y_cell < self.height {
            let mut x_cell = pos_x;
            while x_cell < self.width {
                let render_x = (x_cell - pos_x) * 2;
                let render_y = (y_cell - pos_y) * 2;
                
                let tl_index = (render_y * aligned_bytes_per_row + render_x * BYTES_PER_PIXEL as u32) as usize;
                let tr_index = tl_index + BYTES_PER_PIXEL;
                let bl_index = ((render_y + 1) * aligned_bytes_per_row + render_x * BYTES_PER_PIXEL as u32) as usize;
                let br_index = bl_index + BYTES_PER_PIXEL;
                
                // Get RGBA colors for TL, TR, BL, BR
                let mut pixels_rgba: [RGBA; 4] = [[0.0; 4]; 4];
                pixels_rgba[0] = get_pixel_color(tl_index, pixel_data, len, is_bgra); // TL
                pixels_rgba[1] = get_pixel_color(tr_index, pixel_data, len, is_bgra); // TR
                pixels_rgba[2] = get_pixel_color(bl_index, pixel_data, len, is_bgra); // BL
                pixels_rgba[3] = get_pixel_color(br_index, pixel_data, len, is_bgra); // BR
                
                let cell_result = render_quadrant_block(pixels_rgba);
                
                self.set_cell_with_alpha_blending(x_cell, y_cell, cell_result.char, 
                                                 cell_result.fg, cell_result.bg, 0)?;
                
                x_cell += 1;
            }
            y_cell += 1;
        }
        
        Ok(())
    }
}

// Helper functions for quadrant rendering

fn get_pixel_color(idx: usize, data: &[u8], data_len: usize, bgra: bool) -> RGBA {
    if idx + 3 >= data_len {
        return [1.0, 0.0, 1.0, 0.0]; // Return transparent magenta for out-of-bounds
    }
    
    let (r_byte, g_byte, b_byte, a_byte) = if bgra {
        (data[idx + 2], data[idx + 1], data[idx], data[idx + 3])
    } else {
        (data[idx], data[idx + 1], data[idx + 2], data[idx + 3])
    };
    
    [
        r_byte as f32 * INV_255,
        g_byte as f32 * INV_255,
        b_byte as f32 * INV_255,
        a_byte as f32 * INV_255,
    ]
}

const QUADRANT_CHARS: [u32; 16] = [
    32,     // 0000 Space
    0x2597, // 0001 BR ░
    0x2596, // 0010 BL ░
    0x2584, // 0011 Lower Half Block ▄
    0x259D, // 0100 TR ░
    0x2590, // 0101 Right Half Block ▐
    0x259E, // 0110 TR+BL ░
    0x259F, // 0111 TR+BL+BR ░
    0x2598, // 1000 TL ░
    0x259A, // 1001 TL+BR ░
    0x258C, // 1010 Left Half Block ▌
    0x2599, // 1011 TL+BL+BR ░
    0x2580, // 1100 Upper Half Block ▀
    0x259C, // 1101 TL+TR+BR ░
    0x259B, // 1110 TL+TR+BL ░
    0x2588, // 1111 Full Block █
];

fn color_distance(a: RGBA, b: RGBA) -> f32 {
    let dr = a[0] - b[0];
    let dg = a[1] - b[1];
    let db = a[2] - b[2];
    dr * dr + dg * dg + db * db
}

fn closest_color_index(pixel: RGBA, candidates: [RGBA; 2]) -> u8 {
    if color_distance(pixel, candidates[0]) <= color_distance(pixel, candidates[1]) {
        0
    } else {
        1
    }
}

fn average_color_rgba(pixels: &[RGBA]) -> RGBA {
    if pixels.is_empty() {
        return [0.0, 0.0, 0.0, 0.0];
    }
    
    let mut sum_r = 0.0;
    let mut sum_g = 0.0;
    let mut sum_b = 0.0;
    let mut sum_a = 0.0;
    
    for p in pixels {
        sum_r += p[0];
        sum_g += p[1];
        sum_b += p[2];
        sum_a += p[3];
    }
    
    let len = pixels.len() as f32;
    [sum_r / len, sum_g / len, sum_b / len, sum_a / len]
}

fn luminance(color: RGBA) -> f32 {
    0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
}

pub struct QuadrantResult {
    pub char: u32,
    pub fg: RGBA,
    pub bg: RGBA,
}

fn render_quadrant_block(pixels: [RGBA; 4]) -> QuadrantResult {
    // 1. Find the most different pair of pixels
    let mut p_idx_a = 0;
    let mut p_idx_b = 1;
    let mut max_dist = color_distance(pixels[0], pixels[1]);
    
    for i in 0..4 {
        for j in (i + 1)..4 {
            let dist = color_distance(pixels[i], pixels[j]);
            if dist > max_dist {
                p_idx_a = i;
                p_idx_b = j;
                max_dist = dist;
            }
        }
    }
    
    let p_cand_a = pixels[p_idx_a];
    let p_cand_b = pixels[p_idx_b];
    
    // 2. Determine chosen_dark_color and chosen_light_color based on luminance
    let (chosen_dark_color, chosen_light_color) = if luminance(p_cand_a) <= luminance(p_cand_b) {
        (p_cand_a, p_cand_b)
    } else {
        (p_cand_b, p_cand_a)
    };
    
    // 3. Classify quadrants and build quadrant_bits
    let mut quadrant_bits: u8 = 0;
    let bit_values = [8u8, 4, 2, 1];
    
    for i in 0..4 {
        let pixel_rgba = pixels[i];
        if closest_color_index(pixel_rgba, [chosen_dark_color, chosen_light_color]) == 0 {
            quadrant_bits |= bit_values[i];
        }
    }
    
    // 4. Construct Result
    if quadrant_bits == 0 {
        // All light
        QuadrantResult {
            char: 32,
            fg: chosen_dark_color,
            bg: average_color_rgba(&pixels),
        }
    } else if quadrant_bits == 15 {
        // All dark
        QuadrantResult {
            char: QUADRANT_CHARS[15],
            fg: average_color_rgba(&pixels),
            bg: chosen_light_color,
        }
    } else {
        // Mixed pattern
        QuadrantResult {
            char: QUADRANT_CHARS[quadrant_bits as usize],
            fg: chosen_dark_color,
            bg: chosen_light_color,
        }
    }
}