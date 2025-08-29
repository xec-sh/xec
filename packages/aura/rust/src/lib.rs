#![allow(non_snake_case)]

pub mod ansi;
pub mod buffer;
pub mod text_buffer;
pub mod renderer;

use std::ptr;
use std::slice;
use buffer::{OptimizedBuffer, InitOptions, BorderSides, ClipRect, RGBA};
use text_buffer::TextBuffer;
use renderer::{CliRenderer, DebugOverlayCorner};

fn f32_ptr_to_rgba(ptr: *const f32) -> RGBA {
    unsafe {
        let slice = slice::from_raw_parts(ptr, 4);
        [slice[0], slice[1], slice[2], slice[3]]
    }
}

// ====== Renderer exports ======

#[no_mangle]
pub extern "C" fn createRenderer(width: u32, height: u32, use_alternate_screen: bool) -> *mut CliRenderer {
    if width == 0 || height == 0 {
        eprintln!("Invalid renderer dimensions: {}x{}", width, height);
        return ptr::null_mut();
    }
    
    match CliRenderer::create(width, height, use_alternate_screen) {
        Ok(renderer) => Box::into_raw(renderer),
        Err(err) => {
            eprintln!("Failed to create renderer: {:?}", err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn setUseThread(renderer_ptr: *mut CliRenderer, use_thread: bool) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.set_use_thread(use_thread);
        }
    }
}

#[no_mangle]
pub extern "C" fn destroyRenderer(renderer_ptr: *mut CliRenderer, use_alternate_screen: bool/*, split_height: u32*/) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.destroy(use_alternate_screen/*, split_height*/);
        }
        if !renderer_ptr.is_null() {
            let _ = Box::from_raw(renderer_ptr);
        }
    }
}

#[no_mangle]
pub extern "C" fn setBackgroundColor(renderer_ptr: *mut CliRenderer, color: *const f32) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.set_background_color(f32_ptr_to_rgba(color));
        }
    }
}

#[no_mangle]
pub extern "C" fn setRenderOffset(renderer_ptr: *mut CliRenderer, offset: u32) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.set_render_offset(offset);
        }
    }
}

#[no_mangle]
pub extern "C" fn setLinesRendered(renderer_ptr: *mut CliRenderer, lines: u32) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.set_lines_rendered(lines);
        }
    }
}

#[no_mangle]
pub extern "C" fn updateStats(renderer_ptr: *mut CliRenderer, time: f64, fps: u32, frame_callback_time: f64, animation_request_time: f64) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.update_stats(time, fps, frame_callback_time, animation_request_time);
        }
    }
}

#[no_mangle]
pub extern "C" fn updateMemoryStats(renderer_ptr: *mut CliRenderer, heap_used: u32, heap_total: u32, array_buffers: u32) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.update_memory_stats(heap_used, heap_total, array_buffers);
        }
    }
}

#[no_mangle]
pub extern "C" fn getNextBuffer(renderer_ptr: *mut CliRenderer) -> *mut OptimizedBuffer {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.get_next_buffer() as *mut _
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn getCurrentBuffer(renderer_ptr: *mut CliRenderer) -> *mut OptimizedBuffer {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.get_current_buffer() as *mut _
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn getBufferWidth(buffer_ptr: *mut OptimizedBuffer) -> u32 {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_ref() {
            buffer.width
        } else {
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn getBufferHeight(buffer_ptr: *mut OptimizedBuffer) -> u32 {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_ref() {
            buffer.height
        } else {
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn render(renderer_ptr: *mut CliRenderer, force: bool) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.render(force);
        }
    }
}

// ====== Buffer exports ======

#[no_mangle]
pub extern "C" fn createOptimizedBuffer(width: u32, height: u32, respect_alpha: bool) -> *mut OptimizedBuffer {
    if width == 0 || height == 0 {
        eprintln!("Invalid buffer dimensions: {}x{}", width, height);
        return ptr::null_mut();
    }
    
    let options = InitOptions { respect_alpha };
    
    match OptimizedBuffer::init(width, height, options) {
        Ok(buffer) => Box::into_raw(buffer),
        Err(err) => {
            eprintln!("Failed to create optimized buffer: {:?}", err);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn destroyOptimizedBuffer(buffer_ptr: *mut OptimizedBuffer) {
    unsafe {
        if !buffer_ptr.is_null() {
            let _ = Box::from_raw(buffer_ptr);
        }
    }
}

#[no_mangle]
pub extern "C" fn destroyFrameBuffer(frame_buffer_ptr: *mut OptimizedBuffer) {
    destroyOptimizedBuffer(frame_buffer_ptr);
}

#[no_mangle]
pub extern "C" fn drawFrameBuffer(
    target_ptr: *mut OptimizedBuffer,
    dest_x: i32,
    dest_y: i32,
    frame_buffer: *mut OptimizedBuffer,
    source_x: u32,
    source_y: u32,
    source_width: u32,
    source_height: u32,
) {
    unsafe {
        if let (Some(target), Some(source)) = (target_ptr.as_mut(), frame_buffer.as_ref()) {
            let src_x = if source_x == 0 { None } else { Some(source_x) };
            let src_y = if source_y == 0 { None } else { Some(source_y) };
            let src_width = if source_width == 0 { None } else { Some(source_width) };
            let src_height = if source_height == 0 { None } else { Some(source_height) };
            
            target.draw_frame_buffer(dest_x, dest_y, source, src_x, src_y, src_width, src_height);
        }
    }
}

#[no_mangle]
pub extern "C" fn setCursorPosition(renderer_ptr: *mut CliRenderer, x: i32, y: i32, visible: bool) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.set_cursor_position(x, y, visible);
        }
    }
}

#[no_mangle]
pub extern "C" fn setCursorStyle(renderer_ptr: *mut CliRenderer, style_ptr: *const u8, style_len: usize, blinking: bool) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            let style_slice = slice::from_raw_parts(style_ptr, style_len);
            let style_str = std::str::from_utf8_unchecked(style_slice);
            renderer.set_cursor_style(style_str, blinking);
        }
    }
}

#[no_mangle]
pub extern "C" fn setCursorColor(renderer_ptr: *mut CliRenderer, color: *const f32) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.set_cursor_color(f32_ptr_to_rgba(color));
        }
    }
}

#[no_mangle]
pub extern "C" fn setTerminalTitle(renderer_ptr: *mut CliRenderer, title_ptr: *const u8, title_len: usize) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            let title_slice = slice::from_raw_parts(title_ptr, title_len);
            let title_str = std::str::from_utf8_unchecked(title_slice);
            renderer.set_terminal_title(title_str);
        }
    }
}

#[no_mangle]
pub extern "C" fn setDebugOverlay(renderer_ptr: *mut CliRenderer, enabled: bool, corner: u8) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            let corner_enum = match corner {
                0 => DebugOverlayCorner::TopLeft,
                1 => DebugOverlayCorner::TopRight,
                2 => DebugOverlayCorner::BottomLeft,
                _ => DebugOverlayCorner::BottomRight,
            };
            
            renderer.set_debug_overlay(enabled, corner_enum);
        }
    }
}

#[no_mangle]
pub extern "C" fn clearTerminal(renderer_ptr: *mut CliRenderer) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.clear_terminal();
        }
    }
}

#[no_mangle]
pub extern "C" fn enableMouse(renderer_ptr: *mut CliRenderer, enable_movement: bool) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.enable_mouse(enable_movement);
        }
    }
}

#[no_mangle]
pub extern "C" fn disableMouse(renderer_ptr: *mut CliRenderer) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.disable_mouse();
        }
    }
}

// Buffer manipulation functions

#[no_mangle]
pub extern "C" fn bufferClear(buffer_ptr: *mut OptimizedBuffer, bg: *const f32) {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            let _ = buffer.clear(f32_ptr_to_rgba(bg), None);
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferGetCharPtr(buffer_ptr: *mut OptimizedBuffer) -> *mut u32 {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            buffer.get_char_ptr()
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferGetFgPtr(buffer_ptr: *mut OptimizedBuffer) -> *mut RGBA {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            buffer.get_fg_ptr()
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferGetBgPtr(buffer_ptr: *mut OptimizedBuffer) -> *mut RGBA {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            buffer.get_bg_ptr()
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferGetAttributesPtr(buffer_ptr: *mut OptimizedBuffer) -> *mut u8 {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            buffer.get_attributes_ptr()
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferGetRespectAlpha(buffer_ptr: *mut OptimizedBuffer) -> bool {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_ref() {
            buffer.get_respect_alpha()
        } else {
            false
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferSetRespectAlpha(buffer_ptr: *mut OptimizedBuffer, respect_alpha: bool) {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            buffer.set_respect_alpha(respect_alpha);
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferDrawText(
    buffer_ptr: *mut OptimizedBuffer,
    text: *const u8,
    text_len: usize,
    x: u32,
    y: u32,
    fg: *const f32,
    bg: *const f32,
    attributes: u8,
) {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            let text_slice = slice::from_raw_parts(text, text_len);
            let text_str = std::str::from_utf8_unchecked(text_slice);
            let rgba_fg = f32_ptr_to_rgba(fg);
            let rgba_bg = if bg.is_null() { None } else { Some(f32_ptr_to_rgba(bg)) };
            
            let _ = buffer.draw_text(text_str, x, y, rgba_fg, rgba_bg, attributes);
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferSetCellWithAlphaBlending(
    buffer_ptr: *mut OptimizedBuffer,
    x: u32,
    y: u32,
    char: u32,
    fg: *const f32,
    bg: *const f32,
    attributes: u8,
) {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            let rgba_fg = f32_ptr_to_rgba(fg);
            let rgba_bg = f32_ptr_to_rgba(bg);
            let _ = buffer.set_cell_with_alpha_blending(x, y, char, rgba_fg, rgba_bg, attributes);
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferFillRect(
    buffer_ptr: *mut OptimizedBuffer,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    bg: *const f32,
) {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            let rgba_bg = f32_ptr_to_rgba(bg);
            let _ = buffer.fill_rect(x, y, width, height, rgba_bg);
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferDrawPackedBuffer(
    buffer_ptr: *mut OptimizedBuffer,
    data: *const u8,
    data_len: usize,
    pos_x: u32,
    pos_y: u32,
    terminal_width_cells: u32,
    terminal_height_cells: u32,
) {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            let data_slice = slice::from_raw_parts(data, data_len);
            buffer.draw_packed_buffer(data_slice, data_len, pos_x, pos_y, terminal_width_cells, terminal_height_cells);
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferDrawSuperSampleBuffer(
    buffer_ptr: *mut OptimizedBuffer,
    x: u32,
    y: u32,
    pixel_data: *const u8,
    len: usize,
    format: u8,
    aligned_bytes_per_row: u32,
) {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            let pixel_slice = slice::from_raw_parts(pixel_data, len);
            let _ = buffer.draw_super_sample_buffer(x, y, pixel_slice, len, format, aligned_bytes_per_row);
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferDrawBox(
    buffer_ptr: *mut OptimizedBuffer,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    border_chars: *const u32,
    packed_options: u32,
    border_color: *const f32,
    background_color: *const f32,
    title: *const u8,
    title_len: u32,
) {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            let border_sides = BorderSides {
                top: (packed_options & 0b1000) != 0,
                right: (packed_options & 0b0100) != 0,
                bottom: (packed_options & 0b0010) != 0,
                left: (packed_options & 0b0001) != 0,
            };
            
            let should_fill = ((packed_options >> 4) & 1) != 0;
            let title_alignment = ((packed_options >> 5) & 0b11) as u8;
            
            let title_str = if title.is_null() {
                None
            } else {
                let title_slice = slice::from_raw_parts(title, title_len as usize);
                Some(std::str::from_utf8_unchecked(title_slice))
            };
            
            let border_chars_slice = slice::from_raw_parts(border_chars, 11); // 11 border chars
            
            let _ = buffer.draw_box(
                x, y, width, height,
                border_chars_slice, border_sides,
                f32_ptr_to_rgba(border_color),
                f32_ptr_to_rgba(background_color),
                should_fill, title_str, title_alignment
            );
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferResize(buffer_ptr: *mut OptimizedBuffer, width: u32, height: u32) {
    unsafe {
        if let Some(buffer) = buffer_ptr.as_mut() {
            let _ = buffer.resize(width, height);
        }
    }
}

#[no_mangle]
pub extern "C" fn resizeRenderer(renderer_ptr: *mut CliRenderer, width: u32, height: u32) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            let _ = renderer.resize(width, height);
        }
    }
}

#[no_mangle]
pub extern "C" fn addToHitGrid(
    renderer_ptr: *mut CliRenderer,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    id: u32,
) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_mut() {
            renderer.add_to_hit_grid(x, y, width, height, id);
        }
    }
}

#[no_mangle]
pub extern "C" fn checkHit(renderer_ptr: *mut CliRenderer, x: u32, y: u32) -> u32 {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_ref() {
            renderer.check_hit(x, y)
        } else {
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn dumpHitGrid(renderer_ptr: *mut CliRenderer) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_ref() {
            renderer.dump_hit_grid();
        }
    }
}

#[no_mangle]
pub extern "C" fn dumpBuffers(renderer_ptr: *mut CliRenderer, timestamp: i64) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_ref() {
            renderer.dump_buffers(timestamp);
        }
    }
}

#[no_mangle]
pub extern "C" fn dumpStdoutBuffer(renderer_ptr: *mut CliRenderer, timestamp: i64) {
    unsafe {
        if let Some(renderer) = renderer_ptr.as_ref() {
            renderer.dump_stdout_buffer(timestamp);
        }
    }
}

// ====== TextBuffer exports ======

#[no_mangle]
pub extern "C" fn createTextBuffer(length: u32) -> *mut TextBuffer {
    match TextBuffer::init(length) {
        Ok(tb) => Box::into_raw(tb),
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn destroyTextBuffer(tb: *mut TextBuffer) {
    unsafe {
        if !tb.is_null() {
            let _ = Box::from_raw(tb);
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferGetCharPtr(tb: *mut TextBuffer) -> *mut u32 {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            text_buffer.get_char_ptr()
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferGetFgPtr(tb: *mut TextBuffer) -> *mut RGBA {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            text_buffer.get_fg_ptr()
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferGetBgPtr(tb: *mut TextBuffer) -> *mut RGBA {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            text_buffer.get_bg_ptr()
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferGetAttributesPtr(tb: *mut TextBuffer) -> *mut u16 {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            text_buffer.get_attributes_ptr()
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferGetLength(tb: *const TextBuffer) -> u32 {
    unsafe {
        if let Some(text_buffer) = tb.as_ref() {
            text_buffer.get_length()
        } else {
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferSetCell(
    tb: *mut TextBuffer,
    index: u32,
    char: u32,
    fg: *const f32,
    bg: *const f32,
    attr: u16,
) {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            let _ = text_buffer.set_cell(index, char, f32_ptr_to_rgba(fg), f32_ptr_to_rgba(bg), attr);
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferConcat(tb1: *mut TextBuffer, tb2: *mut TextBuffer) -> *mut TextBuffer {
    unsafe {
        if let (Some(text_buffer1), Some(text_buffer2)) = (tb1.as_ref(), tb2.as_ref()) {
            match text_buffer1.concat(text_buffer2) {
                Ok(result) => Box::into_raw(result),
                Err(_) => ptr::null_mut(),
            }
        } else {
            ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferResize(tb: *mut TextBuffer, new_length: u32) {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            let _ = text_buffer.resize(new_length);
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferReset(tb: *mut TextBuffer) {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            text_buffer.reset();
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferSetSelection(
    tb: *mut TextBuffer,
    start: u32,
    end: u32,
    bg_color: *const f32,
    fg_color: *const f32,
) {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            let bg = if bg_color.is_null() { None } else { Some(f32_ptr_to_rgba(bg_color)) };
            let fg = if fg_color.is_null() { None } else { Some(f32_ptr_to_rgba(fg_color)) };
            text_buffer.set_selection(start, end, bg, fg);
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferResetSelection(tb: *mut TextBuffer) {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            text_buffer.reset_selection();
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferSetDefaultFg(tb: *mut TextBuffer, fg: *const f32) {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            let fg_color = if fg.is_null() { None } else { Some(f32_ptr_to_rgba(fg)) };
            text_buffer.set_default_fg(fg_color);
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferSetDefaultBg(tb: *mut TextBuffer, bg: *const f32) {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            let bg_color = if bg.is_null() { None } else { Some(f32_ptr_to_rgba(bg)) };
            text_buffer.set_default_bg(bg_color);
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferSetDefaultAttributes(tb: *mut TextBuffer, attr: *const u8) {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            let attr_value = if attr.is_null() { None } else { Some(*attr) };
            text_buffer.set_default_attributes(attr_value);
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferResetDefaults(tb: *mut TextBuffer) {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            text_buffer.reset_defaults();
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferWriteChunk(
    tb: *mut TextBuffer,
    text_bytes: *const u8,
    text_len: u32,
    fg: *const f32,
    bg: *const f32,
    attr: *const u8,
) -> u32 {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            let text_slice = slice::from_raw_parts(text_bytes, text_len as usize);
            let fg_color = if fg.is_null() { None } else { Some(f32_ptr_to_rgba(fg)) };
            let bg_color = if bg.is_null() { None } else { Some(f32_ptr_to_rgba(bg)) };
            let attr_value = if attr.is_null() { None } else { Some(*attr) };
            
            text_buffer.write_chunk(text_slice, fg_color, bg_color, attr_value).unwrap_or(0)
        } else {
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferGetCapacity(tb: *const TextBuffer) -> u32 {
    unsafe {
        if let Some(text_buffer) = tb.as_ref() {
            text_buffer.get_capacity()
        } else {
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferFinalizeLineInfo(tb: *mut TextBuffer) {
    unsafe {
        if let Some(text_buffer) = tb.as_mut() {
            text_buffer.finalize_line_info();
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferGetLineStartsPtr(tb: *const TextBuffer) -> *const u32 {
    unsafe {
        if let Some(text_buffer) = tb.as_ref() {
            text_buffer.get_line_starts().as_ptr()
        } else {
            ptr::null()
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferGetLineWidthsPtr(tb: *const TextBuffer) -> *const u32 {
    unsafe {
        if let Some(text_buffer) = tb.as_ref() {
            text_buffer.get_line_widths().as_ptr()
        } else {
            ptr::null()
        }
    }
}

#[no_mangle]
pub extern "C" fn textBufferGetLineCount(tb: *const TextBuffer) -> u32 {
    unsafe {
        if let Some(text_buffer) = tb.as_ref() {
            text_buffer.get_line_count()
        } else {
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn bufferDrawTextBuffer(
    buffer_ptr: *mut OptimizedBuffer,
    text_buffer_ptr: *mut TextBuffer,
    x: i32,
    y: i32,
    clip_x: i32,
    clip_y: i32,
    clip_width: u32,
    clip_height: u32,
    has_clip_rect: bool,
) {
    unsafe {
        if let (Some(buffer), Some(text_buffer)) = (buffer_ptr.as_mut(), text_buffer_ptr.as_ref()) {
            let clip_rect = if has_clip_rect {
                Some(ClipRect {
                    x: clip_x,
                    y: clip_y,
                    width: clip_width,
                    height: clip_height,
                })
            } else {
                None
            };
            
            let _ = buffer.draw_text_buffer(text_buffer, x, y, clip_rect);
        }
    }
}