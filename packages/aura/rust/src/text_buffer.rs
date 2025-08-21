use crate::buffer::{RGBA, TextSelection};
use std::ptr;

pub const USE_DEFAULT_FG: u16 = 0x8000;
pub const USE_DEFAULT_BG: u16 = 0x4000;
pub const USE_DEFAULT_ATTR: u16 = 0x2000;
pub const ATTR_MASK: u16 = 0x00FF;

#[derive(Debug)]
pub enum TextBufferError {
    OutOfMemory,
    InvalidDimensions,
    InvalidIndex,
}

/// TextBuffer holds packed arrays for styled text fragments
/// Similar to OptimizedBuffer but specifically for text fragments
pub struct TextBuffer {
    char: Vec<u32>,
    fg: Vec<RGBA>,
    bg: Vec<RGBA>,
    attributes: Vec<u16>,
    length: u32,
    cursor: u32,
    selection: Option<TextSelection>,
    default_fg: Option<RGBA>,
    default_bg: Option<RGBA>,
    default_attributes: Option<u8>,
    
    line_starts: Vec<u32>,
    line_widths: Vec<u32>,
    current_line_width: u32,
}

impl TextBuffer {
    pub fn init(length: u32) -> Result<Box<TextBuffer>, TextBufferError> {
        if length == 0 {
            return Err(TextBufferError::InvalidDimensions);
        }
        
        let char_vec = vec![' ' as u32; length as usize];
        let fg_vec = vec![[1.0, 1.0, 1.0, 1.0]; length as usize];
        let bg_vec = vec![[0.0, 0.0, 0.0, 0.0]; length as usize];
        let attributes_vec = vec![0u16; length as usize];
        
        let mut line_starts = Vec::new();
        line_starts.push(0);
        
        Ok(Box::new(TextBuffer {
            char: char_vec,
            fg: fg_vec,
            bg: bg_vec,
            attributes: attributes_vec,
            length,
            cursor: 0,
            selection: None,
            default_fg: None,
            default_bg: None,
            default_attributes: None,
            line_starts,
            line_widths: Vec::new(),
            current_line_width: 0,
        }))
    }
    
    pub fn deinit(self: Box<Self>) {
        // Rust automatically handles memory deallocation when Box is dropped
        drop(self);
    }
    
    #[inline(always)]
    pub fn get_char_ptr(&mut self) -> *mut u32 {
        self.char.as_mut_ptr()
    }
    
    #[inline(always)]
    pub fn get_char_ptr_const(&self) -> *const u32 {
        self.char.as_ptr()
    }
    
    #[inline(always)]
    pub fn get_fg_ptr(&mut self) -> *mut RGBA {
        self.fg.as_mut_ptr()
    }
    
    #[inline(always)]
    pub fn get_fg_ptr_const(&self) -> *const RGBA {
        self.fg.as_ptr()
    }
    
    #[inline(always)]
    pub fn get_bg_ptr(&mut self) -> *mut RGBA {
        self.bg.as_mut_ptr()
    }
    
    #[inline(always)]
    pub fn get_bg_ptr_const(&self) -> *const RGBA {
        self.bg.as_ptr()
    }
    
    #[inline(always)]
    pub fn get_attributes_ptr(&mut self) -> *mut u16 {
        self.attributes.as_mut_ptr()
    }
    
    #[inline(always)]
    pub fn get_attributes_ptr_const(&self) -> *const u16 {
        self.attributes.as_ptr()
    }
    
    #[inline(always)]
    pub fn get_length(&self) -> u32 {
        self.cursor
    }
    
    #[inline(always)]
    pub fn get_capacity(&self) -> u32 {
        self.length
    }
    
    #[inline(always)]
    pub fn set_cell(&mut self, index: u32, char: u32, fg: RGBA, bg: RGBA, attr: u16) -> Result<(), TextBufferError> {
        if index >= self.length {
            return Err(TextBufferError::InvalidIndex);
        }
        
        let idx = index as usize;
        unsafe {
            // Skip bounds check since we already validated
            *self.char.get_unchecked_mut(idx) = char;
            *self.fg.get_unchecked_mut(idx) = fg;
            *self.bg.get_unchecked_mut(idx) = bg;
            *self.attributes.get_unchecked_mut(idx) = attr;
        }
        
        Ok(())
    }
    
    /// Concatenate another TextBuffer to create a new combined buffer
    pub fn concat(&self, other: &TextBuffer) -> Result<Box<TextBuffer>, TextBufferError> {
        let new_length = self.cursor + other.cursor;
        let mut result = TextBuffer::init(new_length)?;
        
        let self_cursor = self.cursor as usize;
        let other_cursor = other.cursor as usize;
        
        // Use ptr::copy_nonoverlapping for better performance
        unsafe {
            // Copy self's data
            ptr::copy_nonoverlapping(self.char.as_ptr(), result.char.as_mut_ptr(), self_cursor);
            ptr::copy_nonoverlapping(self.fg.as_ptr(), result.fg.as_mut_ptr(), self_cursor);
            ptr::copy_nonoverlapping(self.bg.as_ptr(), result.bg.as_mut_ptr(), self_cursor);
            ptr::copy_nonoverlapping(self.attributes.as_ptr(), result.attributes.as_mut_ptr(), self_cursor);
            
            // Copy other's data
            ptr::copy_nonoverlapping(
                other.char.as_ptr(), 
                result.char.as_mut_ptr().add(self_cursor), 
                other_cursor
            );
            ptr::copy_nonoverlapping(
                other.fg.as_ptr(), 
                result.fg.as_mut_ptr().add(self_cursor), 
                other_cursor
            );
            ptr::copy_nonoverlapping(
                other.bg.as_ptr(), 
                result.bg.as_mut_ptr().add(self_cursor), 
                other_cursor
            );
            ptr::copy_nonoverlapping(
                other.attributes.as_ptr(), 
                result.attributes.as_mut_ptr().add(self_cursor), 
                other_cursor
            );
        }
        
        result.cursor = new_length;
        
        // Copy line information
        result.line_starts.clear();
        result.line_widths.clear();
        
        for &start in &self.line_starts {
            result.line_starts.push(start);
        }
        for &width in &self.line_widths {
            result.line_widths.push(width);
        }
        
        // Skip first line start from other buffer and adjust offsets
        for &start in &other.line_starts[1..] {
            result.line_starts.push(start + self.cursor);
        }
        for &width in &other.line_widths {
            result.line_widths.push(width);
        }
        
        result.current_line_width = other.current_line_width;
        
        Ok(result)
    }
    
    pub fn reset(&mut self) {
        self.cursor = 0;
        self.line_starts.clear();
        self.line_widths.clear();
        self.current_line_width = 0;
        self.line_starts.push(0);
    }
    
    pub fn set_selection(&mut self, start: u32, end: u32, bgColor: Option<RGBA>, fgColor: Option<RGBA>) {
        self.selection = Some(TextSelection {
            start,
            end,
            bgColor,
            fgColor,
        });
    }
    
    pub fn reset_selection(&mut self) {
        self.selection = None;
    }
    
    pub fn get_selection(&self) -> &Option<TextSelection> {
        &self.selection
    }
    
    pub fn get_default_fg(&self) -> Option<RGBA> {
        self.default_fg
    }
    
    pub fn get_default_bg(&self) -> Option<RGBA> {
        self.default_bg
    }
    
    pub fn get_default_attributes(&self) -> Option<u8> {
        self.default_attributes
    }
    
    pub fn set_default_fg(&mut self, fg: Option<RGBA>) {
        self.default_fg = fg;
    }
    
    pub fn set_default_bg(&mut self, bg: Option<RGBA>) {
        self.default_bg = bg;
    }
    
    pub fn set_default_attributes(&mut self, attributes: Option<u8>) {
        self.default_attributes = attributes;
    }
    
    pub fn reset_defaults(&mut self) {
        self.default_fg = None;
        self.default_bg = None;
        self.default_attributes = None;
    }
    
    pub fn resize(&mut self, new_length: u32) -> Result<(), TextBufferError> {
        if new_length == self.length {
            return Ok(());
        }
        if new_length == 0 {
            return Err(TextBufferError::InvalidDimensions);
        }
        
        let new_len = new_length as usize;
        
        self.char.resize(new_len, ' ' as u32);
        self.fg.resize(new_len, [1.0, 1.0, 1.0, 1.0]);
        self.bg.resize(new_len, [0.0, 0.0, 0.0, 0.0]);
        self.attributes.resize(new_len, 0);
        
        self.length = new_length;
        Ok(())
    }
    
    /// Write a UTF-8 encoded text chunk with styling to the buffer at the current cursor position
    /// This advances the cursor by the number of codepoints written and auto-resizes if needed
    /// Returns flags: bit 0 = resized during write, bits 1-31 = number of codepoints written
    pub fn write_chunk(&mut self, text_bytes: &[u8], fg: Option<RGBA>, bg: Option<RGBA>, attr: Option<u8>) -> Result<u32, TextBufferError> {
        let mut attr_value: u16 = 0;
        
        let use_fg = fg.unwrap_or_else(|| {
            attr_value |= USE_DEFAULT_FG;
            self.default_fg.unwrap_or([1.0, 1.0, 1.0, 1.0])
        });
        
        let use_bg = bg.unwrap_or_else(|| {
            attr_value |= USE_DEFAULT_BG;
            self.default_bg.unwrap_or([0.0, 0.0, 0.0, 0.0])
        });
        
        if let Some(a) = attr {
            attr_value |= a as u16;
        } else {
            attr_value |= USE_DEFAULT_ATTR;
            attr_value |= self.default_attributes.unwrap_or(0) as u16;
        }
        
        // Fast path for valid UTF-8 (which is the common case)
        let text = unsafe {
            // We trust the caller to provide valid UTF-8 for performance
            // The FFI layer should validate this
            std::str::from_utf8_unchecked(text_bytes)
        };
        let mut codepoint_count: u32 = 0;
        let mut was_resized = false;
        
        for codepoint in text.chars() {
            if self.cursor >= self.length {
                let new_capacity = self.length + 256;
                self.resize(new_capacity)?;
                was_resized = true;
            }
            
            self.set_cell(self.cursor, codepoint as u32, use_fg, use_bg, attr_value)?;
            
            if codepoint == '\n' {
                self.line_widths.push(self.current_line_width);
                self.line_starts.push(self.cursor + 1);
                self.current_line_width = 0;
            } else {
                self.current_line_width += 1;
            }
            
            self.cursor += 1;
            codepoint_count += 1;
        }
        
        let resize_flag: u32 = if was_resized { 1 } else { 0 };
        Ok((codepoint_count << 1) | resize_flag)
    }
    
    pub fn finalize_line_info(&mut self) {
        if self.current_line_width > 0 || self.cursor == 0 {
            self.line_widths.push(self.current_line_width);
        }
    }
    
    pub fn get_line_starts(&self) -> &[u32] {
        &self.line_starts
    }
    
    pub fn get_line_widths(&self) -> &[u32] {
        &self.line_widths
    }
    
    pub fn get_line_count(&self) -> u32 {
        self.line_starts.len() as u32
    }
}