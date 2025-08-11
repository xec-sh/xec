
      const { createTerminal, ColorSystem, ColorDepth, x, y } = require('../../dist/index.cjs');
      
      async function test() {
        const terminal = createTerminal({ mode: 'inline' });
        await terminal.init();
        
        // Test different color depths
        const depths = [
          { depth: ColorDepth.None, name: 'Monochrome' },
          { depth: ColorDepth.Basic, name: '16 Colors' },
          { depth: ColorDepth.Extended, name: '256 Colors' },
          { depth: ColorDepth.TrueColor, name: 'True Color' }
        ];
        
        for (const { depth, name } of depths) {
          const colors = new ColorSystem(depth);
          console.log(`Testing ${name}`);
          
          // Test that color methods work for each depth
          const red = colors.red;
          const green = colors.green;
          const blue = colors.blue;
          
          // These should all return valid color codes
          expect(red).toBeTruthy();
          expect(green).toBeTruthy();
          expect(blue).toBeTruthy();
        }
        
        console.log('Color depth test complete');
        await terminal.close();
        process.exit(0);
      }
      
      test().catch(err => {
        console.error(err);
        process.exit(1);
      });
    