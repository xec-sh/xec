use crate::ansi::{ANSI, TextAttributes, RGBA};
use crate::buffer::{self, OptimizedBuffer, InitOptions};
use std::io::{self, Write, BufWriter};
use std::sync::{Arc, Mutex, Condvar, RwLock};
use std::thread;
use std::time::Instant;
use std::sync::atomic::{AtomicBool, Ordering};
use crossterm::cursor;

const CLEAR_CHAR: u32 = 0x0a00;
const MAX_STAT_SAMPLES: usize = 30;
const STAT_SAMPLE_CAPACITY: usize = 30;
const DEFAULT_CURSOR_X: u32 = 1;
const DEFAULT_CURSOR_Y: u32 = 1;
const COLOR_EPSILON_DEFAULT: f32 = 0.00001;
const RUN_BUFFER_SIZE: usize = 2048;  // Increased for better batching
const OUTPUT_BUFFER_SIZE: usize = 1024 * 1024; // 1MB is usually sufficient
const DEFAULT_SPACE_CHAR: u32 = 32;

#[derive(Debug)]
pub enum RendererError {
    OutOfMemory,
    InvalidDimensions,
    ThreadingFailed,
    WriteFailed,
}

#[inline(always)]
fn rgba_component_to_u8(component: f32) -> u8 {
    // Fast path for common values
    if component <= 0.0 { return 0; }
    if component >= 1.0 { return 255; }
    
    // Use faster conversion without round()
    ((component * 255.0) + 0.5) as u8
}

#[inline(always)]
fn rgba_to_ints(rgba: RGBA) -> [u8; 4] {
    [
        rgba_component_to_u8(rgba[0]),
        rgba_component_to_u8(rgba[1]),
        rgba_component_to_u8(rgba[2]),
        rgba_component_to_u8(rgba[3]),
    ]
}

#[derive(Debug, Clone, Copy)]
pub enum CursorStyle {
    Block,
    Line,
    Underline,
}

#[derive(Debug, Clone, Copy)]
pub enum DebugOverlayCorner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Clone)]
struct GlobalCursor {
    x: u32,
    y: u32,
    visible: bool,
    style: CursorStyle,
    blinking: bool,
    color: RGBA,
}


struct RenderStats {
    last_frame_time: f64,
    average_frame_time: f64,
    frame_count: u64,
    fps: u32,
    cells_updated: u32,
    render_time: Option<f64>,
    overall_frame_time: Option<f64>,
    buffer_reset_time: Option<f64>,
    stdout_write_time: Option<f64>,
    heap_used: u32,
    heap_total: u32,
    array_buffers: u32,
    frame_callback_time: Option<f64>,
    animation_request_time: Option<f64>,
}

struct StatSamples {
    last_frame_time: Vec<f64>,
    render_time: Vec<f64>,
    overall_frame_time: Vec<f64>,
    buffer_reset_time: Vec<f64>,
    stdout_write_time: Vec<f64>,
    cells_updated: Vec<u32>,
    frame_callback_time: Vec<f64>,
    animation_request_time: Vec<f64>,
}

struct DebugOverlay {
    enabled: bool,
    corner: DebugOverlayCorner,
}

// Thread communication structure for passing output data
struct RenderRequest {
    output_data: Vec<u8>,
}

// State for tracking inline rendering position and attributes
struct InlineState {
    start_row: u32,
    start_col: u32,
    saved_fg: Option<RGBA>,
    saved_bg: Option<RGBA>,
    saved_attrs: u8,
}

pub struct CliRenderer {
    width: u32,
    height: u32,
    current_render_buffer: *mut OptimizedBuffer,
    next_render_buffer: *mut OptimizedBuffer,
    background_color: RGBA,
    render_offset: u32,
    has_rendered_once: bool,
    use_alternate_screen: bool,
    lines_rendered: u32,  // Track actual rendered lines for inline mode
    previous_lines_rendered: u32,  // Track previous frame's line count for clearing
    inline_state: InlineState,  // State for inline rendering
    
    render_stats: RenderStats,
    stat_samples: StatSamples,
    last_render_time: Instant,
    
    render_thread: Option<thread::JoinHandle<()>>,
    stdout_writer: BufWriter<io::Stdout>,
    
    debug_overlay: DebugOverlay,
    
    // Cursor state (renderer-scoped)
    cursor: GlobalCursor,
    
    // Threading
    use_thread: bool,
    render_mutex: Arc<Mutex<()>>,
    render_condition: Arc<Condvar>,
    render_requested: Arc<AtomicBool>,
    should_terminate: Arc<AtomicBool>,
    render_in_progress: Arc<AtomicBool>,
    render_request: Arc<RwLock<Option<RenderRequest>>>,
    
    current_hit_grid: Vec<u32>,
    next_hit_grid: Vec<u32>,
    hit_grid_width: u32,
    hit_grid_height: u32,
    
    // Pre-allocated output buffers for double buffering
    output_buffer_a: Vec<u8>,
    output_buffer_b: Vec<u8>,
    active_buffer: ActiveBuffer,
    
    // Mouse tracking
    mouse_enabled: bool,
    mouse_movement_enabled: bool,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum ActiveBuffer {
    A,
    B,
}

#[inline(always)]
fn codepoint_display_width(cp: u32) -> u8 {
    // Fast path for ASCII (most common)
    if cp < 128 {
        return if cp == 0 || cp < 32 || cp == 0x7F { 0 } else { 1 };
    }
    
    // Combining marks
    if matches!(cp, 0x0300..=0x036F | 0x1AB0..=0x1AFF | 0x1DC0..=0x1DFF | 0x20D0..=0x20FF | 0xFE20..=0xFE2F) {
        return 0;
    }
    
    // Wide characters
    if matches!(cp, 
        0x1100..=0x115F | 0x2329 | 0x232A | 0x2E80..=0xA4CF |
        0xAC00..=0xD7A3 | 0xF900..=0xFAFF | 0xFE10..=0xFE19 |
        0xFE30..=0xFE6F | 0xFF00..=0xFF60 | 0xFFE0..=0xFFE6 |
        0x1F300..=0x1FAFF
    ) {
        return 2;
    }
    
    1
}

impl CliRenderer {
    pub fn create(width: u32, height: u32, use_alternate_screen: bool) -> Result<Box<CliRenderer>, RendererError> {
        if width == 0 || height == 0 {
            return Err(RendererError::InvalidDimensions);
        }
        
        let mut current_buffer = OptimizedBuffer::init(width, height, InitOptions::default())
            .map_err(|_| RendererError::OutOfMemory)?;
        let mut next_buffer = OptimizedBuffer::init(width, height, InitOptions::default())
            .map_err(|_| RendererError::OutOfMemory)?;
        
        // Initialize buffers with clear character
        current_buffer.clear([0.0, 0.0, 0.0, 1.0], Some(CLEAR_CHAR)).ok();
        next_buffer.clear([0.0, 0.0, 0.0, 1.0], None).ok();
        
        let hit_grid_size = (width * height) as usize;
        let current_hit_grid = vec![0u32; hit_grid_size];
        let next_hit_grid = vec![0u32; hit_grid_size];
        
        let stdout_writer = BufWriter::with_capacity(4096, io::stdout());

        // First render in inline mode - query and save cursor position
        let position_result = cursor::position();
        let (col, row) = position_result.unwrap_or((0, 0));
        
        Ok(Box::new(CliRenderer {
            width,
            height,
            current_render_buffer: Box::into_raw(current_buffer),
            next_render_buffer: Box::into_raw(next_buffer),
            background_color: [0.0, 0.0, 0.0, 1.0],
            render_offset: 0,
            use_alternate_screen,
            has_rendered_once: false,
            lines_rendered: 1,
            previous_lines_rendered: 1,
            inline_state: InlineState {
                start_row: row as u32,
                start_col: col as u32,
                saved_fg: None,
                saved_bg: None,
                saved_attrs: 0,
            },
            render_stats: RenderStats {
                last_frame_time: 0.0,
                average_frame_time: 0.0,
                frame_count: 0,
                fps: 0,
                cells_updated: 0,
                render_time: None,
                overall_frame_time: None,
                buffer_reset_time: None,
                stdout_write_time: None,
                heap_used: 0,
                heap_total: 0,
                array_buffers: 0,
                frame_callback_time: None,
                animation_request_time: None,
            },
            
            stat_samples: StatSamples {
                last_frame_time: Vec::with_capacity(STAT_SAMPLE_CAPACITY),
                render_time: Vec::with_capacity(STAT_SAMPLE_CAPACITY),
                overall_frame_time: Vec::with_capacity(STAT_SAMPLE_CAPACITY),
                buffer_reset_time: Vec::with_capacity(STAT_SAMPLE_CAPACITY),
                stdout_write_time: Vec::with_capacity(STAT_SAMPLE_CAPACITY),
                cells_updated: Vec::with_capacity(STAT_SAMPLE_CAPACITY),
                frame_callback_time: Vec::with_capacity(STAT_SAMPLE_CAPACITY),
                animation_request_time: Vec::with_capacity(STAT_SAMPLE_CAPACITY),
            },
            
            last_render_time: Instant::now(),
            render_thread: None,
            stdout_writer,
            
            debug_overlay: DebugOverlay {
                enabled: false,
                corner: DebugOverlayCorner::BottomRight,
            },

            // Cursor state - renderer-scoped
            cursor: GlobalCursor {
                x: DEFAULT_CURSOR_X,
                y: DEFAULT_CURSOR_Y,
                visible: false,
                style: CursorStyle::Block,
                blinking: false,
                color: [1.0, 1.0, 1.0, 1.0],
            },
            
            use_thread: false,
            render_mutex: Arc::new(Mutex::new(())),
            render_condition: Arc::new(Condvar::new()),
            render_requested: Arc::new(AtomicBool::new(false)),
            should_terminate: Arc::new(AtomicBool::new(false)),
            render_in_progress: Arc::new(AtomicBool::new(false)),
            render_request: Arc::new(RwLock::new(None)),
            
            current_hit_grid,
            next_hit_grid,
            hit_grid_width: width,
            hit_grid_height: height,
            
            output_buffer_a: Vec::with_capacity(OUTPUT_BUFFER_SIZE),
            output_buffer_b: Vec::with_capacity(OUTPUT_BUFFER_SIZE),
            active_buffer: ActiveBuffer::A,
            
            mouse_enabled: false,
            mouse_movement_enabled: false,
        }))
    }
    
    pub fn destroy(&mut self, use_alternate_screen: bool) {
        self.perform_shutdown_sequence(use_alternate_screen);
        
        // Stop render thread if running
        if let Some(handle) = self.render_thread.take() {
            self.should_terminate.store(true, Ordering::Relaxed);
            self.render_condition.notify_all();
            handle.join().ok();
        }
        self.stdout_writer.flush().ok();
    }
    
    fn perform_shutdown_sequence(&mut self, use_alternate_screen: bool) {
        // Disable mouse tracking first
        self.disable_mouse();
        
        if use_alternate_screen {
            // Switch back to main screen
            self.stdout_writer.write_all(ANSI::SWITCH_TO_MAIN_SCREEN.as_bytes()).ok();
            self.stdout_writer.flush().ok();
            self.stdout_writer.write_all(ANSI::RESET.as_bytes()).ok();

            // Reset terminal state
            self.stdout_writer.write_all(ANSI::RESET_CURSOR_COLOR.as_bytes()).ok();
            self.stdout_writer.write_all(ANSI::RESTORE_CURSOR_STATE.as_bytes()).ok();
            self.stdout_writer.write_all(ANSI::DEFAULT_CURSOR_STYLE.as_bytes()).ok();
        } else {
        //     // Inline mode - move to position after rendered content
        //     // Move to position after rendered content
            use std::fmt::Write;
            let mut temp = String::new();
            write!(&mut temp, "\x1b[{};1H", self.inline_state.start_row + self.lines_rendered).ok();
            self.stdout_writer.write_all(temp.as_bytes()).ok();
        
            // Move to beginning of line and add newline for clean exit
            self.stdout_writer.write_all(b"\n").ok();
            self.stdout_writer.write_all(ANSI::RESET_CURSOR_COLOR.as_bytes()).ok();
            self.stdout_writer.write_all(ANSI::DEFAULT_CURSOR_STYLE.as_bytes()).ok();
        }

        // Show cursor
        self.stdout_writer.write_all(ANSI::SHOW_CURSOR.as_bytes()).ok();
        
        // Workaround for Ghostty not showing the cursor after shutdown
        self.stdout_writer.flush().ok();
        std::thread::sleep(std::time::Duration::from_millis(10));
        self.stdout_writer.write_all(ANSI::SHOW_CURSOR.as_bytes()).ok();
        self.stdout_writer.flush().ok();
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    
    #[inline]
    fn add_stat_sample<T: Copy>(samples: &mut Vec<T>, value: T) {
        if samples.len() >= MAX_STAT_SAMPLES {
            samples.remove(0);
        }
        samples.push(value);
    }
    
    #[inline]
    fn get_stat_average(samples: &Vec<f64>) -> f64 {
        if samples.is_empty() {
            return 0.0;
        }
        
        let sum: f64 = samples.iter().sum();
        sum / (samples.len() as f64)
    }
    
    pub fn set_use_thread(&mut self, use_thread: bool) {
        if self.use_thread == use_thread {
            return;
        }
        
        if use_thread {
            // Spawn render thread if not already running
            if self.render_thread.is_none() {
                let render_mutex = self.render_mutex.clone();
                let render_condition = self.render_condition.clone();
                let render_requested = self.render_requested.clone();
                let should_terminate = self.should_terminate.clone();
                let render_in_progress = self.render_in_progress.clone();
                let render_request = self.render_request.clone();
                
                let handle = thread::spawn(move || {
                    Self::render_thread_fn(
                        render_mutex,
                        render_condition,
                        render_requested,
                        should_terminate,
                        render_in_progress,
                        render_request,
                    );
                });
                
                self.render_thread = Some(handle);
                self.use_thread = true;
            }
        } else {
            // Stop and join render thread
            if let Some(handle) = self.render_thread.take() {
                self.should_terminate.store(true, Ordering::Relaxed);
                self.render_condition.notify_all();
                handle.join().ok();
                self.should_terminate.store(false, Ordering::Relaxed);
            }
            self.use_thread = false;
        }
    }
    
    // Render thread function - runs in separate thread
    fn render_thread_fn(
        render_mutex: Arc<Mutex<()>>,
        render_condition: Arc<Condvar>,
        render_requested: Arc<AtomicBool>,
        should_terminate: Arc<AtomicBool>,
        render_in_progress: Arc<AtomicBool>,
        render_request: Arc<RwLock<Option<RenderRequest>>>,
    ) {
        let mut stdout_writer = BufWriter::new(io::stdout());
        
        loop {
            // Wait for render request
            let guard = render_mutex.lock().unwrap();
            let _guard = render_condition.wait_while(guard, |_| {
                !render_requested.load(Ordering::Relaxed) && !should_terminate.load(Ordering::Relaxed)
            }).unwrap();
            
            if should_terminate.load(Ordering::Relaxed) {
                break;
            }
            
            render_requested.store(false, Ordering::Relaxed);
            
            // Get render request data
            let request = {
                let mut request_guard = render_request.write().unwrap();
                request_guard.take()
            };
            
            if let Some(request) = request {
                let write_start = Instant::now();
                
                // Write output to stdout
                if !request.output_data.is_empty() {
                    stdout_writer.write_all(&request.output_data).ok();
                    stdout_writer.flush().ok();
                }
                
                let _write_time = write_start.elapsed().as_secs_f64() * 1000.0;
                
                // Store write time back if needed
                // Note: In the Zig version this is done via shared stats
                // We could add similar mechanism if needed
            }
            
            // Signal that rendering is complete
            render_in_progress.store(false, Ordering::Relaxed);
            render_condition.notify_all();
        }
    }
    
    pub fn update_stats(&mut self, time: f64, fps: u32, frame_callback_time: f64, animation_request_time: f64) {
        self.render_stats.overall_frame_time = Some(time);
        self.render_stats.fps = fps;
        self.render_stats.frame_callback_time = Some(frame_callback_time);
        self.render_stats.animation_request_time = Some(animation_request_time);
        
        Self::add_stat_sample(&mut self.stat_samples.overall_frame_time, time);
        Self::add_stat_sample(&mut self.stat_samples.frame_callback_time, frame_callback_time);
        Self::add_stat_sample(&mut self.stat_samples.animation_request_time, animation_request_time);
    }
    
    pub fn update_memory_stats(&mut self, heap_used: u32, heap_total: u32, array_buffers: u32) {
        self.render_stats.heap_used = heap_used;
        self.render_stats.heap_total = heap_total;
        self.render_stats.array_buffers = array_buffers;
    }
    
    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), RendererError> {
        if self.width == width && self.height == height {
            return Ok(());
        }
        
        self.width = width;
        self.height = height;
        
        unsafe {
            (*self.current_render_buffer).resize(width, height).map_err(|_| RendererError::OutOfMemory)?;
            (*self.next_render_buffer).resize(width, height).map_err(|_| RendererError::OutOfMemory)?;
            
            (*self.current_render_buffer).clear([0.0, 0.0, 0.0, 1.0], Some(CLEAR_CHAR)).ok();
            (*self.next_render_buffer).clear(self.background_color, None).ok();
        }
        
        let new_hit_grid_size = (width * height) as usize;
        if new_hit_grid_size > self.current_hit_grid.len() {
            self.current_hit_grid = vec![0u32; new_hit_grid_size];
            self.next_hit_grid = vec![0u32; new_hit_grid_size];
            self.hit_grid_width = width;
            self.hit_grid_height = height;
        }
        
        // Update cursor position if needed
        self.cursor.x = self.cursor.x.min(width);
        self.cursor.y = self.cursor.y.min(height);
        
        Ok(())
    }
    
    pub fn set_background_color(&mut self, rgba: RGBA) {
        self.background_color = rgba;
    }
    
    pub fn set_render_offset(&mut self, offset: u32) {
        self.render_offset = offset;
    }
    
    pub fn set_lines_rendered(&mut self, lines: u32) {
        self.previous_lines_rendered = self.lines_rendered;
        self.lines_rendered = lines;
    }
    
    pub fn render(&mut self, force: bool) {
        let now = Instant::now();
        let delta_time = now.duration_since(self.last_render_time).as_secs_f64() * 1000.0;
        
        self.last_render_time = now;
        self.render_debug_overlay();
        
        // Force render on first frame
        let should_force = force || !self.has_rendered_once;
        self.prepare_render_frame(should_force);
        
        if self.use_thread {
            // Wait for previous render to complete
            let guard = self.render_mutex.lock().unwrap();
            let _guard = self.render_condition.wait_while(guard, |_| {
                self.render_in_progress.load(Ordering::Relaxed)
            }).unwrap();
            
            // Prepare render request with current buffer data
            let output_buffer = if self.active_buffer == ActiveBuffer::A {
                self.output_buffer_a.clone()
            } else {
                self.output_buffer_b.clone()
            };
            
            // Set render request
            {
                let mut request_guard = self.render_request.write().unwrap();
                *request_guard = Some(RenderRequest {
                    output_data: output_buffer,
                });
            }
            
            // Signal render thread
            self.render_requested.store(true, Ordering::Relaxed);
            self.render_in_progress.store(true, Ordering::Relaxed);
            self.render_condition.notify_all();
            
            // Swap buffers for next frame
            self.active_buffer = if self.active_buffer == ActiveBuffer::A {
                ActiveBuffer::B
            } else {
                ActiveBuffer::A
            };
            
            // Note: Write time will be calculated in the render thread
            // We could add a mechanism to retrieve it if needed
        } else {
            // Synchronous rendering
            let write_start = Instant::now();
            let output_buffer = if self.active_buffer == ActiveBuffer::A {
                &self.output_buffer_a
            } else {
                &self.output_buffer_b
            };
            
            self.stdout_writer.write_all(output_buffer).ok();
            self.stdout_writer.flush().ok();
            
            // Swap active buffer AFTER writing, for next frame
            self.active_buffer = if self.active_buffer == ActiveBuffer::A {
                ActiveBuffer::B
            } else {
                ActiveBuffer::A
            };
            
            let write_time = write_start.elapsed().as_secs_f64() * 1000.0;
            self.render_stats.stdout_write_time = Some(write_time);
        }
        
        self.render_stats.last_frame_time = delta_time;
        self.render_stats.frame_count += 1;
        
        Self::add_stat_sample(&mut self.stat_samples.last_frame_time, delta_time);
        if let Some(rt) = self.render_stats.render_time {
            Self::add_stat_sample(&mut self.stat_samples.render_time, rt);
        }
        if let Some(brt) = self.render_stats.buffer_reset_time {
            Self::add_stat_sample(&mut self.stat_samples.buffer_reset_time, brt);
        }
        if let Some(swt) = self.render_stats.stdout_write_time {
            Self::add_stat_sample(&mut self.stat_samples.stdout_write_time, swt);
        }
        Self::add_stat_sample(&mut self.stat_samples.cells_updated, self.render_stats.cells_updated);
        
        // Mark that we've rendered at least once (after everything is done)
        self.has_rendered_once = true;
    }
    
    pub fn get_next_buffer(&mut self) -> &mut OptimizedBuffer {
        unsafe { &mut *self.next_render_buffer }
    }
    
    pub fn get_current_buffer(&mut self) -> &mut OptimizedBuffer {
        unsafe { &mut *self.current_render_buffer }
    }
    
    fn prepare_render_frame(&mut self, force: bool) {
        let render_start = Instant::now();
        let mut cells_updated: u32 = 0;
        
        // Select output buffer
        let output_buffer = if self.active_buffer == ActiveBuffer::A {
            &mut self.output_buffer_a
        } else {
            &mut self.output_buffer_b
        };
        output_buffer.clear();
        
        // Hide cursor at start
        output_buffer.extend_from_slice(ANSI::HIDE_CURSOR.as_bytes());
        
        // In inline mode, we need to force render after clearing the screen
        let mut force_render = force;
        
        // In inline mode, handle cursor positioning differently
        if !self.use_alternate_screen {
            force_render = true;
        }
        
        let mut current_fg: Option<RGBA> = None;
        let mut current_bg: Option<RGBA> = None;
        let mut current_attributes: i16 = -1;
        
        let mut run_buffer = Vec::with_capacity(RUN_BUFFER_SIZE);
        let color_epsilon = COLOR_EPSILON_DEFAULT;
        
        // In inline mode, only render the lines we need
        let render_height = if !self.use_alternate_screen {
            self.lines_rendered
        } else {
            self.height
        };
        
        // Skip rendering empty lines on first inline render
        let skip_empty_lines = !self.use_alternate_screen && !self.has_rendered_once;
        
        for y in 0..render_height {
            let mut run_start: Option<u32> = None;
            let mut run_start_visual_col: Option<u32> = None;
            let mut run_length: u32 = 0;
            run_buffer.clear();
            let mut current_visual_col: u32 = 0;
            
            // Check if this line is empty (only spaces) when skip_empty_lines is true
            let mut line_is_empty = skip_empty_lines;
            if skip_empty_lines {
                for x in 0..self.width {
                    if let Some(cell) = unsafe { (*self.next_render_buffer).get(x, y) } {
                        if cell.char != DEFAULT_SPACE_CHAR || 
                           !buffer::rgba_equal(cell.fg, [1.0, 1.0, 1.0, 1.0], color_epsilon) ||
                           !buffer::rgba_equal(cell.bg, [0.0, 0.0, 0.0, 1.0], color_epsilon) {
                            line_is_empty = false;
                            break;
                        }
                    }
                }
            }
            
            // Skip rendering this line if it's empty on first render
            if line_is_empty {
                continue;
            }
            
            for x in 0..self.width {
                let current_cell = unsafe { (*self.current_render_buffer).get(x, y) };
                let next_cell = unsafe { (*self.next_render_buffer).get(x, y) };
                
                if current_cell.is_none() || next_cell.is_none() {
                    continue;
                }
                
                let current = current_cell.unwrap();
                let next = next_cell.unwrap();
                
                // Check if we need to update this cell
                if !force_render {
                    let char_equal = current.char == next.char;
                    let attr_equal = current.attributes == next.attributes;
                    
                    if char_equal && attr_equal &&
                       buffer::rgba_equal(current.fg, next.fg, color_epsilon) &&
                       buffer::rgba_equal(current.bg, next.bg, color_epsilon) {
                        // Cell hasn't changed, flush any pending run and skip
                        if run_length > 0 {
                            let start_col = run_start_visual_col.unwrap_or(0) + 1;
                            Self::write_move_to_inline(
                                output_buffer, 
                                start_col, 
                                y + 1 + self.render_offset, 
                                self.use_alternate_screen,
                                &self.inline_state,
                                current_fg,
                                current_bg,
                                current_attributes as u8
                            );
                            output_buffer.extend_from_slice(&run_buffer);
                            output_buffer.extend_from_slice(ANSI::RESET.as_bytes());
                            
                            run_start = None;
                            run_start_visual_col = None;
                            run_length = 0;
                            run_buffer.clear();
                        }
                        
                        let w = codepoint_display_width(next.char);
                        current_visual_col += if w == 0 { 1 } else { w as u32 };
                        continue;
                    }
                }
                
                // Check if attributes changed from previous cell
                let fg_match = current_fg.map_or(false, |fg| buffer::rgba_equal(fg, next.fg, color_epsilon));
                let bg_match = current_bg.map_or(false, |bg| buffer::rgba_equal(bg, next.bg, color_epsilon));
                let same_attributes = fg_match && bg_match && next.attributes as i16 == current_attributes;
                
                if !same_attributes || run_start.is_none() {
                    // Flush previous run if any
                    if run_length > 0 {
                        let start_col = run_start_visual_col.unwrap_or(0) + 1;
                        Self::write_move_to_inline(
                            output_buffer, 
                            start_col, 
                            y + 1 + self.render_offset, 
                            self.use_alternate_screen,
                            &self.inline_state,
                            current_fg,
                            current_bg,
                            current_attributes as u8
                        );
                        output_buffer.extend_from_slice(&run_buffer);
                        output_buffer.extend_from_slice(ANSI::RESET.as_bytes());
                        run_buffer.clear();
                    }
                    
                    // Start new run
                    run_start = Some(x);
                    run_start_visual_col = Some(current_visual_col);
                    run_length = 0;
                    
                    current_fg = Some(next.fg);
                    current_bg = Some(next.bg);
                    current_attributes = next.attributes as i16;
                    
                    // Move to position
                    Self::write_move_to_inline(
                        output_buffer, 
                        current_visual_col + 1, 
                        y + 1 + self.render_offset, 
                        self.use_alternate_screen,
                        &self.inline_state,
                        current_fg,
                        current_bg,
                        current_attributes as u8
                    );
                    
                    // Set colors
                    Self::write_fg_color(output_buffer, 
                        rgba_component_to_u8(next.fg[0]),
                        rgba_component_to_u8(next.fg[1]),
                        rgba_component_to_u8(next.fg[2]));
                    
                    Self::write_bg_color(output_buffer,
                        rgba_component_to_u8(next.bg[0]),
                        rgba_component_to_u8(next.bg[1]),
                        rgba_component_to_u8(next.bg[2]));
                    
                    // Apply attributes
                    if next.attributes != 0 {
                        let mut attr_buf = Vec::new();
                        TextAttributes::apply_attributes_output_writer(&mut attr_buf, next.attributes).ok();
                        output_buffer.extend_from_slice(&attr_buf);
                    }
                }
                
                // Check if this is a wide character continuation marker
                const WIDE_CHAR_CONTINUATION: u32 = 0xFFFF;
                if next.char == WIDE_CHAR_CONTINUATION {
                    // Skip continuation cells - they're handled by the terminal
                    // Just update the current buffer
                    unsafe { (*self.current_render_buffer).set_cell(x, y, next.char, next.fg, next.bg, next.attributes).ok(); }
                    cells_updated += 1;
                    // Don't advance visual column - continuation is part of previous char
                    continue;
                }
                
                // Add character to run buffer
                let mut out_char = next.char;
                let w = codepoint_display_width(out_char);
                if w == 0 {
                    out_char = ' ' as u32;
                }
                
                // Encode UTF-8 character
                if let Some(ch) = char::from_u32(out_char) {
                    let mut utf8_buf = [0u8; 4];
                    let len = ch.encode_utf8(&mut utf8_buf).len();
                    run_buffer.extend_from_slice(&utf8_buf[..len]);
                }
                run_length += 1;
                
                // Update current buffer with the new cell
                unsafe { (*self.current_render_buffer).set_cell(x, y, next.char, next.fg, next.bg, next.attributes).ok(); }
                
                cells_updated += 1;
                current_visual_col += if w == 0 { 1 } else { w as u32 };
                
                // Removed the extra space handling - terminal handles wide chars naturally
            }
            
            // Flush remaining run at end of line
            if run_length > 0 {
                let start_col = run_start_visual_col.unwrap_or(0) + 1;
                Self::write_move_to_inline(
                    output_buffer, 
                    start_col, 
                    y + 1 + self.render_offset, 
                    self.use_alternate_screen,
                    &self.inline_state,
                    current_fg,
                    current_bg,
                    current_attributes as u8
                );
                output_buffer.extend_from_slice(&run_buffer);
                output_buffer.extend_from_slice(ANSI::RESET.as_bytes());
            }
            
            // In inline mode, clear to end of line to remove any leftover content
            if !self.use_alternate_screen && y < self.lines_rendered {
                output_buffer.extend_from_slice("\x1b[K".as_bytes()); // Clear to end of line
            }
        }
        
        // Update inline state with current colors and attributes
        self.inline_state.saved_fg = current_fg;
        self.inline_state.saved_bg = current_bg;
        self.inline_state.saved_attrs = current_attributes as u8;
        
        // Reset attributes
        output_buffer.extend_from_slice(ANSI::RESET.as_bytes());
        
        // In inline mode, clear any leftover lines if content shrunk
        if !self.use_alternate_screen && self.has_rendered_once {
            if self.previous_lines_rendered > self.lines_rendered {
                // Clear the extra lines that are no longer needed
                // Move to the line after the last rendered line
                use std::fmt::Write;
                let mut temp = String::new();
                write!(&mut temp, "\x1b[{};1H", self.inline_state.start_row + self.lines_rendered + 1).ok();
                output_buffer.extend_from_slice(temp.as_bytes());
                // Clear from cursor to end of screen
                output_buffer.extend_from_slice("\x1b[J".as_bytes());
            }
        }
        
        // Handle cursor
        if self.cursor.visible {
            // Set cursor style
            let cursor_style_code = match (self.cursor.style, self.cursor.blinking) {
                (CursorStyle::Block, true) => ANSI::CURSOR_BLOCK_BLINK,
                (CursorStyle::Block, false) => ANSI::CURSOR_BLOCK,
                (CursorStyle::Line, true) => ANSI::CURSOR_LINE_BLINK,
                (CursorStyle::Line, false) => ANSI::CURSOR_LINE,
                (CursorStyle::Underline, true) => ANSI::CURSOR_UNDERLINE_BLINK,
                (CursorStyle::Underline, false) => ANSI::CURSOR_UNDERLINE,
            };
            
            // Set cursor color
            Self::write_cursor_color(output_buffer,
                rgba_component_to_u8(self.cursor.color[0]),
                rgba_component_to_u8(self.cursor.color[1]),
                rgba_component_to_u8(self.cursor.color[2]));
            
            output_buffer.extend_from_slice(cursor_style_code.as_bytes());
            
            // Position cursor properly
            if self.use_alternate_screen {
                Self::write_move_to(output_buffer, self.cursor.x, self.cursor.y + self.render_offset);
            } else {
                // In inline mode, position cursor relative to the rendered area
                if self.cursor.y < self.lines_rendered {
                    Self::write_move_to_inline(
                        output_buffer, 
                        self.cursor.x, 
                        self.cursor.y + 1, 
                        false,
                        &self.inline_state,
                        None,  // cursor doesn't have specific color context
                        None,
                        0
                    );
                }
            }
            
            output_buffer.extend_from_slice(ANSI::SHOW_CURSOR.as_bytes());
        } else {
            output_buffer.extend_from_slice(ANSI::HIDE_CURSOR.as_bytes());
        }
        
        let render_time = render_start.elapsed().as_secs_f64() * 1000.0;
        self.render_stats.cells_updated = cells_updated;
        self.render_stats.render_time = Some(render_time);
        
        // Clear next buffer for next frame
        let buffer_reset_start = Instant::now();
        unsafe { (*self.next_render_buffer).clear(self.background_color, None).ok(); }
        let buffer_reset_time = buffer_reset_start.elapsed().as_secs_f64() * 1000.0;
        self.render_stats.buffer_reset_time = Some(buffer_reset_time);
        
        // Swap hit grids
        std::mem::swap(&mut self.current_hit_grid, &mut self.next_hit_grid);
        self.next_hit_grid.fill(0);
        
        // NOTE: Buffer swap is now done in render() after writing to stdout
    }
    
    fn write_move_to(buffer: &mut Vec<u8>, x: u32, y: u32) {
        use std::fmt::Write;
        let mut temp = String::new();
        write!(&mut temp, "\x1b[{};{}H", y, x).ok();
        buffer.extend_from_slice(temp.as_bytes());
    }
    
    fn write_move_to_inline(
        buffer: &mut Vec<u8>, 
        x: u32, 
        y: u32, 
        use_alternate_screen: bool,
        inline_state: &InlineState,
        current_fg: Option<RGBA>,
        current_bg: Option<RGBA>,
        current_attrs: u8
    ) {
        if !use_alternate_screen {
            use std::fmt::Write;
            let mut temp = String::new();
            
            // Calculate absolute position from saved start position
            let abs_row = inline_state.start_row + y;
            let abs_col = if x > 0 { x } else { inline_state.start_col };
            
            // Use absolute positioning
            write!(&mut temp, "\x1b[{};{}H", abs_row, abs_col).ok();
            buffer.extend_from_slice(temp.as_bytes());
            
            // Restore colors and attributes if they were changed
            // This ensures text keeps its styling after cursor movement
            if let Some(fg) = current_fg {
                if inline_state.saved_fg != Some(fg) {
                    let [r, g, b, _] = rgba_to_ints(fg);
                    Self::write_fg_color(buffer, r, g, b);
                }
            }
            
            if let Some(bg) = current_bg {
                if inline_state.saved_bg != Some(bg) {
                    let [r, g, b, _] = rgba_to_ints(bg);
                    Self::write_bg_color(buffer, r, g, b);
                }
            }
            
            if current_attrs != inline_state.saved_attrs && current_attrs != 0 {
                Self::write_attributes(buffer, current_attrs);
            }
        } else {
            // Use absolute positioning for alternate screen mode
            Self::write_move_to(buffer, x, y);
        }
    }
    
    fn write_fg_color(buffer: &mut Vec<u8>, r: u8, g: u8, b: u8) {
        use std::fmt::Write;
        let mut temp = String::new();
        write!(&mut temp, "\x1b[38;2;{};{};{}m", r, g, b).ok();
        buffer.extend_from_slice(temp.as_bytes());
    }
    
    fn write_attributes(buffer: &mut Vec<u8>, attributes: u8) {
        let mut attr_buf = Vec::new();
        TextAttributes::apply_attributes_output_writer(&mut attr_buf, attributes).ok();
        buffer.extend_from_slice(&attr_buf);
    }
    
    fn write_bg_color(buffer: &mut Vec<u8>, r: u8, g: u8, b: u8) {
        use std::fmt::Write;
        let mut temp = String::new();
        write!(&mut temp, "\x1b[48;2;{};{};{}m", r, g, b).ok();
        buffer.extend_from_slice(temp.as_bytes());
    }
    
    fn write_cursor_color(buffer: &mut Vec<u8>, r: u8, g: u8, b: u8) {
        use std::fmt::Write;
        let mut temp = String::new();
        // OSC 12 - set cursor color
        write!(&mut temp, "\x1b]12;rgb:{:02x}/{:02x}/{:02x}\x07", r, g, b).ok();
        buffer.extend_from_slice(temp.as_bytes());
    }
    
    pub fn set_debug_overlay(&mut self, enabled: bool, corner: DebugOverlayCorner) {
        self.debug_overlay.enabled = enabled;
        self.debug_overlay.corner = corner;
    }
    
    pub fn clear_terminal(&mut self) {
        self.stdout_writer.write_all(ANSI::CLEAR_AND_HOME.as_bytes()).ok();
        self.stdout_writer.flush().ok();
    }
    
    // Renderer-scoped cursor functions
    pub fn set_cursor_position(&mut self, x: i32, y: i32, visible: bool) {
        self.cursor.x = x.max(1) as u32;
        self.cursor.y = y.max(1) as u32;
        self.cursor.visible = visible;
        
        // Write cursor position to terminal
        if visible {
            let cmd = format!("\x1b[{};{}H", self.cursor.y, self.cursor.x);
            self.stdout_writer.write_all(cmd.as_bytes()).ok();
            self.stdout_writer.write_all(b"\x1b[?25h").ok(); // Show cursor
        } else {
            self.stdout_writer.write_all(b"\x1b[?25l").ok(); // Hide cursor
        }
        self.stdout_writer.flush().ok();
    }
    
    pub fn set_cursor_style(&mut self, style_str: &str, blinking: bool) {
        self.cursor.style = match style_str.to_lowercase().as_str() {
            "block" => CursorStyle::Block,
            "line" | "bar" => CursorStyle::Line,
            "underline" => CursorStyle::Underline,
            _ => CursorStyle::Block,
        };
        self.cursor.blinking = blinking;
        
        // Apply cursor style using ANSI escape codes
        let style_code = match self.cursor.style {
            CursorStyle::Block => if blinking { 1 } else { 2 },
            CursorStyle::Underline => if blinking { 3 } else { 4 },
            CursorStyle::Line => if blinking { 5 } else { 6 },
        };
        
        let cmd = format!("\x1b[{} q", style_code);
        self.stdout_writer.write_all(cmd.as_bytes()).ok();
        self.stdout_writer.flush().ok();
    }
    
    pub fn set_cursor_color(&mut self, color: RGBA) {
        self.cursor.color = color;
        
        // Set cursor color using OSC 12 (if supported)
        let [r, g, b, _] = rgba_to_ints(color);
        let cmd = format!("\x1b]12;rgb:{:02x}/{:02x}/{:02x}\x1b\\", r, g, b);
        self.stdout_writer.write_all(cmd.as_bytes()).ok();
        self.stdout_writer.flush().ok();
    }
    
    pub fn add_to_hit_grid(&mut self, x: i32, y: i32, width: u32, height: u32, id: u32) {
        let start_x = (x.max(0) as u32).min(self.hit_grid_width);
        let start_y = (y.max(0) as u32).min(self.hit_grid_height);
        let end_x = ((x + width as i32).max(0) as u32).min(self.hit_grid_width);
        let end_y = ((y + height as i32).max(0) as u32).min(self.hit_grid_height);
        
        if start_x >= end_x || start_y >= end_y {
            return;
        }
        
        for row in start_y..end_y {
            let row_start = (row * self.hit_grid_width) as usize;
            let start_idx = row_start + start_x as usize;
            let end_idx = row_start + end_x as usize;
            
            for idx in start_idx..end_idx {
                self.next_hit_grid[idx] = id;
            }
        }
    }
    
    pub fn check_hit(&self, x: u32, y: u32) -> u32 {
        if x >= self.hit_grid_width || y >= self.hit_grid_height {
            return 0;
        }
        
        let index = (y * self.hit_grid_width + x) as usize;
        self.current_hit_grid[index]
    }
    
    pub fn dump_hit_grid(&self) {
        use std::fs::File;
        use std::io::Write;
        
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        let filename = format!("hitgrid_{}.txt", timestamp);
        
        if let Ok(mut file) = File::create(&filename) {
            for y in 0..self.hit_grid_height {
                for x in 0..self.hit_grid_width {
                    let index = (y * self.hit_grid_width + x) as usize;
                    let id = self.current_hit_grid[index];
                    let ch = if id == 0 { '.' } else { ('0' as u8 + (id % 10) as u8) as char };
                    write!(file, "{}", ch).ok();
                }
                writeln!(file).ok();
            }
        }
    }
    
    pub fn dump_buffers(&self, timestamp: i64) {
        unsafe {
            self.dump_single_buffer(&*self.current_render_buffer, "current", timestamp);
            self.dump_single_buffer(&*self.next_render_buffer, "next", timestamp);
        }
        self.dump_stdout_buffer(timestamp);
    }
    
    fn dump_single_buffer(&self, buffer: &OptimizedBuffer, buffer_name: &str, timestamp: i64) {
        use std::fs::{self, File};
        use std::io::Write;
        
        fs::create_dir_all("buffer_dump").ok();
        
        let filename = format!("buffer_dump/{}_buffer_{}.txt", buffer_name, timestamp);
        
        if let Ok(mut file) = File::create(&filename) {
            writeln!(file, "{} Buffer ({}x{}):", buffer_name, self.width, self.height).ok();
            writeln!(file, "Characters:").ok();
            
            for y in 0..self.height {
                for x in 0..self.width {
                    if let Some(cell) = buffer.get(x, y) {
                        if let Some(ch) = char::from_u32(cell.char) {
                            write!(file, "{}", ch).ok();
                        } else {
                            write!(file, " ").ok();
                        }
                    } else {
                        write!(file, " ").ok();
                    }
                }
                writeln!(file).ok();
            }
        }
    }
    
    pub fn dump_stdout_buffer(&self, timestamp: i64) {
        use std::fs::{self, File};
        use std::io::Write;
        
        fs::create_dir_all("buffer_dump").ok();
        
        let filename = format!("buffer_dump/stdout_buffer_{}.txt", timestamp);
        
        if let Ok(mut file) = File::create(&filename) {
            writeln!(file, "Stdout Buffer Output (timestamp: {}):", timestamp).ok();
            writeln!(file, "Last Rendered ANSI Output:").ok();
            writeln!(file, "================").ok();
            
            let last_buffer = if self.active_buffer == ActiveBuffer::A {
                &self.output_buffer_b
            } else {
                &self.output_buffer_a
            };
            
            if !last_buffer.is_empty() {
                file.write_all(last_buffer).ok();
            } else {
                writeln!(file, "(no output rendered yet)").ok();
            }
            
            writeln!(file, "\n================").ok();
            writeln!(file, "Buffer size: {} bytes", last_buffer.len()).ok();
            writeln!(file, "Active buffer: {:?}", self.active_buffer).ok();
        }
    }
    
    fn render_debug_overlay(&mut self) {
        if !self.debug_overlay.enabled {
            return;
        }
        
        let width: u32 = 40;
        let height: u32 = 12;
        
        if self.width < width + 2 || self.height < height + 2 {
            return;
        }
        
        let (x, y) = match self.debug_overlay.corner {
            DebugOverlayCorner::TopLeft => (1, 1),
            DebugOverlayCorner::TopRight => (self.width - width - 1, 1),
            DebugOverlayCorner::BottomLeft => (1, self.height - height - 1),
            DebugOverlayCorner::BottomRight => (self.width - width - 1, self.height - height - 1),
        };
        
        // Draw overlay background
        unsafe {
            (*self.next_render_buffer).fill_rect(x, y, width, height, 
                [20.0 / 255.0, 20.0 / 255.0, 40.0 / 255.0, 1.0]).ok();
            
            // Draw title
            (*self.next_render_buffer).draw_text("Debug Information", x + 1, y + 1,
                [1.0, 1.0, 100.0 / 255.0, 1.0],
                Some([0.0, 0.0, 0.0, 0.0]),
                TextAttributes::BOLD).ok();
        }
        
        let mut row = 2;
        let bg = Some([0.0, 0.0, 0.0, 0.0]);
        let fg: RGBA = [200.0 / 255.0, 200.0 / 255.0, 200.0 / 255.0, 1.0];
        
        // Calculate averages
        let last_frame_time_avg = Self::get_stat_average(&self.stat_samples.last_frame_time);
        let render_time_avg = Self::get_stat_average(&self.stat_samples.render_time);
        let overall_frame_time_avg = Self::get_stat_average(&self.stat_samples.overall_frame_time);
        let buffer_reset_time_avg = Self::get_stat_average(&self.stat_samples.buffer_reset_time);
        let stdout_write_time_avg = Self::get_stat_average(&self.stat_samples.stdout_write_time);
        let cells_updated_avg = if self.stat_samples.cells_updated.is_empty() {
            0u32
        } else {
            let sum: u32 = self.stat_samples.cells_updated.iter().sum();
            sum / self.stat_samples.cells_updated.len() as u32
        };
        let frame_callback_time_avg = Self::get_stat_average(&self.stat_samples.frame_callback_time);
        let animation_request_time_avg = Self::get_stat_average(&self.stat_samples.animation_request_time);
        
        // FPS
        let fps_text = format!("FPS: {}", self.render_stats.fps);
        unsafe { (*self.next_render_buffer).draw_text(&fps_text, x + 1, y + row, fg, bg, 0).ok(); }
        row += 1;
        
        // Frame Time
        let frame_time_text = format!("Frame: {:.3}ms (avg: {:.3}ms)", 
            self.render_stats.last_frame_time, last_frame_time_avg);
        unsafe { (*self.next_render_buffer).draw_text(&frame_time_text, x + 1, y + row, fg, bg, 0).ok(); }
        row += 1;
        
        // Animation Request Time
        if let Some(animation_request_time) = self.render_stats.animation_request_time {
            let animation_request_text = format!("Animation Req: {:.3}ms (avg: {:.3}ms)", 
                animation_request_time, animation_request_time_avg);
            unsafe { (*self.next_render_buffer).draw_text(&animation_request_text, x + 1, y + row, fg, bg, 0).ok(); }
            row += 1;
        }
        
        // Frame Callback Time
        if let Some(frame_callback_time) = self.render_stats.frame_callback_time {
            let frame_callback_text = format!("Frame Callback: {:.3}ms (avg: {:.3}ms)", 
                frame_callback_time, frame_callback_time_avg);
            unsafe { (*self.next_render_buffer).draw_text(&frame_callback_text, x + 1, y + row, fg, bg, 0).ok(); }
            row += 1;
        }
        
        // Overall Time
        if let Some(overall_time) = self.render_stats.overall_frame_time {
            let overall_text = format!("Overall: {:.3}ms (avg: {:.3}ms)", 
                overall_time, overall_frame_time_avg);
            unsafe { (*self.next_render_buffer).draw_text(&overall_text, x + 1, y + row, fg, bg, 0).ok(); }
            row += 1;
        }
        
        // Render Time
        if let Some(render_time) = self.render_stats.render_time {
            let render_text = format!("Render: {:.3}ms (avg: {:.3}ms)", 
                render_time, render_time_avg);
            unsafe { (*self.next_render_buffer).draw_text(&render_text, x + 1, y + row, fg, bg, 0).ok(); }
            row += 1;
        }
        
        // Buffer Reset Time
        if let Some(reset_time) = self.render_stats.buffer_reset_time {
            let reset_text = format!("Reset: {:.3}ms (avg: {:.3}ms)", 
                reset_time, buffer_reset_time_avg);
            unsafe { (*self.next_render_buffer).draw_text(&reset_text, x + 1, y + row, fg, bg, 0).ok(); }
            row += 1;
        }
        
        // Stdout Write Time
        if let Some(write_time) = self.render_stats.stdout_write_time {
            let write_text = format!("Stdout: {:.3}ms (avg: {:.3}ms)", 
                write_time, stdout_write_time_avg);
            unsafe { (*self.next_render_buffer).draw_text(&write_text, x + 1, y + row, fg, bg, 0).ok(); }
            row += 1;
        }
        
        // Cells Updated
        let cells_text = format!("Cells: {} (avg: {})", 
            self.render_stats.cells_updated, cells_updated_avg);
        unsafe { (*self.next_render_buffer).draw_text(&cells_text, x + 1, y + row, fg, bg, 0).ok(); }
        row += 1;
        
        // Memory Statistics
        if self.render_stats.heap_used > 0 || self.render_stats.heap_total > 0 {
            let memory_text = format!("Memory: {:.2}MB / {:.2}MB / {:.2}MB", 
                self.render_stats.heap_used as f64 / 1024.0 / 1024.0,
                self.render_stats.heap_total as f64 / 1024.0 / 1024.0,
                self.render_stats.array_buffers as f64 / 1024.0 / 1024.0);
            unsafe { (*self.next_render_buffer).draw_text(&memory_text, x + 1, y + row, fg, bg, 0).ok(); }
            row += 1;
        }
        
        // Threading Status
        let thread_text = format!("Threaded: {}", if self.use_thread { "Yes" } else { "No" });
        unsafe { (*self.next_render_buffer).draw_text(&thread_text, x + 1, y + row, fg, bg, 0).ok(); }
    }

    pub fn enable_mouse(&mut self, enable_movement: bool) {
        if self.mouse_enabled {
            return;
        }
        
        self.mouse_enabled = true;
        self.mouse_movement_enabled = enable_movement;
        
        // Write mouse tracking enable sequences
        self.stdout_writer.write_all(ANSI::ENABLE_SGR_MOUSE_MODE.as_bytes()).ok();
        self.stdout_writer.write_all(ANSI::ENABLE_MOUSE_TRACKING.as_bytes()).ok();
        
        if enable_movement {
            self.stdout_writer.write_all(ANSI::ENABLE_ANY_EVENT_TRACKING.as_bytes()).ok();
        } else {
            self.stdout_writer.write_all(ANSI::ENABLE_BUTTON_EVENT_TRACKING.as_bytes()).ok();
        }
        
        self.stdout_writer.flush().ok();
    }
    
    pub fn disable_mouse(&mut self) {
        if !self.mouse_enabled {
            return;
        }
        
        self.mouse_enabled = false;
        self.mouse_movement_enabled = false;
        
        // Write mouse tracking disable sequences
        self.stdout_writer.write_all(ANSI::DISABLE_MOUSE_TRACKING.as_bytes()).ok();
        self.stdout_writer.write_all(ANSI::DISABLE_BUTTON_EVENT_TRACKING.as_bytes()).ok();
        self.stdout_writer.write_all(ANSI::DISABLE_ANY_EVENT_TRACKING.as_bytes()).ok();
        self.stdout_writer.write_all(ANSI::DISABLE_SGR_MOUSE_MODE.as_bytes()).ok();
        
        self.stdout_writer.flush().ok();
    }
}

impl Drop for CliRenderer {
    fn drop(&mut self) {
        unsafe {
            // Clean up raw pointers
            if !self.current_render_buffer.is_null() {
                let _ = Box::from_raw(self.current_render_buffer);
            }
            if !self.next_render_buffer.is_null() {
                let _ = Box::from_raw(self.next_render_buffer);
            }
        }
        
        // Terminate render thread if active
        if let Some(handle) = self.render_thread.take() {
            self.should_terminate.store(true, Ordering::Relaxed);
            self.render_condition.notify_all();
            handle.join().ok();
        }
        
        self.stdout_writer.flush().ok();
    }
}

