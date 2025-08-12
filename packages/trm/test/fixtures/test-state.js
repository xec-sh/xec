
        import { createTerminal } from '../../dist/index.js';
        import { Store } from '../../dist/advanced/state.js';
        
        async function main() {
          const term = createTerminal({ rawMode: true });
          await term.init();
          
          term.screen.clear();
          term.screen.writeAt(0, 0, 'State Management Test');
          
          // Create store
          const store = new Store({
            count: 0,
            message: 'Initial'
          });
          
          // Subscribe to changes
          store.subscribe((state, prevState) => {
            term.screen.writeAt(0, 2, `Count: ${state.count}  `);
            term.screen.writeAt(0, 3, `Message: ${state.message}  `);
            
            if (prevState) {
              term.screen.writeAt(0, 5, `Previous count: ${prevState.count}  `);
            }
          });
          
          // Initial render
          const state = store.getState();
          term.screen.writeAt(0, 2, `Count: ${state.count}`);
          term.screen.writeAt(0, 3, `Message: ${state.message}`);
          
          // Update state
          let updates = 0;
          const interval = setInterval(() => {
            updates++;
            store.setState({
              count: updates,
              message: `Update #${updates}`
            });
            
            if (updates >= 3) {
              clearInterval(interval);
              term.screen.writeAt(0, 7, 'State updates complete');
              setTimeout(() => {
                term.close();
                process.exit(0);
              }, 500);
            }
          }, 500);
        }
        
        main();
      