
        import { createTerminal } from '../../dist/index.js';
        
        async function main() {
          const term = createTerminal({ rawMode: true });
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'Rapid Input Test');
          
          let keyCount = 0;
          let lastKey = '';
          
          term.input.on('key', (event) => {
            keyCount++;
            lastKey = event.key;
            term.screen.writeAt(0, 2, `Keys pressed: ${keyCount}     `);
            term.screen.writeAt(0, 3, `Last key: ${lastKey}     `);
            
            if (keyCount >= 10) {
              term.screen.writeAt(0, 5, 'Rapid input handled successfully');
              setTimeout(() => {
                term.close();
                process.exit(0);
              }, 500);
            }
          });
        }
        
        main();
      