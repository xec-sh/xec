
      const { createTerminal, ColorSystem, ColorDepth, x, y } = require('../../dist/index.cjs');
      
      async function test() {
        const terminal = createTerminal({ mode: 'inline' });
        await terminal.init();
        
        const colors = new ColorSystem(ColorDepth.TrueColor);
        const buffer = terminal.buffer.create(80, 10);
        
        console.log('=== Style Test ===');
        
        // Test different styles
        buffer.writeText(x(0), y(0), 'Bold Text', { 
          fg: colors.red, 
          bold: true 
        });
        
        buffer.writeText(x(0), y(1), 'Italic Text', { 
          fg: colors.green, 
          italic: true 
        });
        
        buffer.writeText(x(0), y(2), 'Underlined', { 
          fg: colors.blue, 
          underline: true 
        });
        
        buffer.writeText(x(0), y(3), 'Strikethrough', { 
          fg: colors.yellow, 
          strikethrough: true 
        });
        
        buffer.writeText(x(0), y(4), 'Dim Text', { 
          fg: colors.cyan, 
          dim: true 
        });
        
        buffer.writeText(x(0), y(5), 'Inverse', { 
          fg: colors.white, 
          bg: colors.black,
          inverse: true 
        });
        
        terminal.buffer.render(buffer);
        
        console.log('\nStyles rendered successfully');
        await terminal.close();
        
        setTimeout(() => process.exit(0), 100);
      }
      
      test().catch(err => {
        console.error(err);
        process.exit(1);
      });
    