use opentui::buffer::{OptimizedBuffer, BorderSides, InitOptions};

fn main() {
    println!("Testing box border background color fix\n");
    
    // Create a buffer
    let mut buffer = OptimizedBuffer::init(50, 10, InitOptions::default()).expect("Failed to create buffer");
    
    // Clear with dark gray background
    buffer.clear([0.1, 0.1, 0.1, 1.0], Some(' ' as u32)).expect("Failed to clear");
    
    // Border characters for single-line box
    let border_chars = [
        0x250C, // ┌ top-left
        0x2510, // ┐ top-right  
        0x2514, // └ bottom-left
        0x2518, // ┘ bottom-right
        0x2500, // ─ horizontal
        0x2502, // │ vertical
    ];
    
    // Draw a box with yellow background and blue border
    let border_sides = BorderSides {
        top: true,
        right: true,
        bottom: true,
        left: true,
    };
    
    let blue_border = [0.0, 0.0, 1.0, 1.0];    // Blue
    let yellow_bg = [1.0, 1.0, 0.0, 1.0];      // Yellow
    
    println!("Drawing box with:");
    println!("  Position: (2, 1)");
    println!("  Size: 20x6");
    println!("  Border color: Blue {:?}", blue_border);
    println!("  Background color: Yellow {:?}", yellow_bg);
    
    buffer.draw_box(
        2, 1,                   // x, y
        20, 6,                  // width, height
        &border_chars,          // border characters
        border_sides,           // which sides to draw
        blue_border,            // border color
        yellow_bg,              // background color
        true,                   // fill background
        Some("Test Box"),       // title
        1,                      // center alignment
    ).expect("Failed to draw box");
    
    // Sample some cells to verify colors
    println!("\nSampling cells:");
    
    // Get a cell from inside the box (should have yellow background)
    if let Some(inner_cell) = buffer.get(5, 3) {
        println!("  Inside box (5,3): bg={:?}", inner_cell.bg);
    }
    
    // Get a cell from the top border (should have blue fg, yellow bg)
    if let Some(border_cell) = buffer.get(2, 1) {
        println!("  Border (2,1): char=0x{:X}, fg={:?}, bg={:?}", 
                 border_cell.char, border_cell.fg, border_cell.bg);
        
        // Verify the fix
        println!("\n✅ Verification:");
        if (border_cell.bg[0] - 1.0).abs() < 0.01 && 
           (border_cell.bg[1] - 1.0).abs() < 0.01 && 
           (border_cell.bg[2] - 0.0).abs() < 0.01 {
            println!("  ✓ Border background is YELLOW (correct!)");
            println!("  ✓ The fix is working properly!");
        } else if border_cell.bg[3] < 0.01 {
            println!("  ✗ Border background is TRANSPARENT (bug not fixed)");
            println!("  ✗ The borders should have the same background as the box fill");
        } else {
            println!("  ? Border background is {:?} (unexpected)", border_cell.bg);
        }
    }
    
    // Visual representation (simplified)
    println!("\nSimplified visual (. = yellow bg, # = border with yellow bg, space = other):");
    for y in 0..8 {
        for x in 0..24 {
            if let Some(cell) = buffer.get(x, y) {
                // Check if it's yellow background
                let is_yellow = (cell.bg[0] - 1.0).abs() < 0.01 && 
                               (cell.bg[1] - 1.0).abs() < 0.01 && 
                               (cell.bg[2] - 0.0).abs() < 0.01;
                
                if is_yellow {
                    if cell.char != 0 && cell.char != ' ' as u32 {
                        print!("#"); // Border with yellow bg
                    } else {
                        print!("."); // Fill with yellow bg
                    }
                } else {
                    print!(" "); // Other
                }
            }
        }
        println!();
    }
    
    println!("\nIf you see a rectangle of # and . characters, the fix is working!");
    println!("The # characters are borders, and they should be surrounded by . (yellow background)");
}