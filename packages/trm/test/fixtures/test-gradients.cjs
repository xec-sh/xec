
      const { createTerminal, ColorSystem, ColorDepth, x, y, cols } = require('../../dist/index.cjs');
      
      async function test() {
        const terminal = createTerminal({ mode: 'inline' });
        await terminal.init();
        
        const colors = new ColorSystem(ColorDepth.TrueColor);
        const buffer = terminal.buffer.create(80, 10);
        
        console.log('=== Gradient Test ===');
        
        // Create a horizontal gradient
        const gradientWidth = 40;
        for (let i = 0; i < gradientWidth; i++) {
          const hue = (i * 360) / gradientWidth;
          const color = colors.hsl(hue, 100, 50);
          buffer.writeText(x(i), y(0), '█', { fg: color });
        }
        
        // Create RGB gradient
        for (let i = 0; i < gradientWidth; i++) {
          const intensity = Math.floor((i / gradientWidth) * 255);
          const color = colors.rgb(intensity, 0, 255 - intensity);
          buffer.writeText(x(i), y(1), '█', { fg: color });
        }
        
        // Create grayscale gradient
        for (let i = 0; i < gradientWidth; i++) {
          const gray = Math.floor((i / gradientWidth) * 255);
          const color = colors.rgb(gray, gray, gray);
          buffer.writeText(x(i), y(2), '█', { fg: color });
        }
        
        terminal.buffer.render(buffer);
        
        console.log('\nGradients rendered successfully');
        await terminal.close();
        
        setTimeout(() => process.exit(0), 100);
      }
      
      test().catch(err => {
        console.error(err);
        process.exit(1);
      });
    