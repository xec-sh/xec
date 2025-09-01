import * as p from '../../src/index.js';

p.intro('spinner styles demo...');

// Spinner styles will be demonstrated in the demoSpinners function below
// Demo function to show different spinner styles
async function demoSpinners() {
  const styles = ['braille', 'circle', 'arrow', 'moon', 'binary'] as const;

  for (const style of styles) {
    const spin = p.spinner({
      style,
      indicator: 'dots',
    });

    p.log.step(`Testing ${style} style...`);
    spin.start(`Loading with ${style} spinner`);

    await new Promise((resolve) => {
      let progress = 0;
      const timer = setInterval(() => {
        progress += 20;
        if (progress >= 100) {
          clearInterval(timer);
          resolve(true);
        }
        spin.message(`Loading with ${style} spinner [${progress}%]`);
      }, 200);
    });

    if (style === 'binary') {
      p.log.success(`Binary style completed!`);
    }
    spin.stop(`✅ ${style} style completed`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Custom frames demo
  p.log.step('Testing custom frames...');
  const customSpin = p.spinner({
    frames: ['🌟', '⭐', '✨', '💫'],
    delay: 150,
    indicator: 'timer',
  });
  customSpin.start('Loading with custom emoji frames');

  await new Promise((resolve) => {
    let progress = 0;
    const timer = setInterval(() => {
      progress += 25;
      if (progress >= 100) {
        clearInterval(timer);
        resolve(true);
      }
      customSpin.message(`Loading with custom frames [${progress}%]`);
    }, 300);
  });

  customSpin.stop('🎉 Custom frames completed!');
  p.outro('All spinner styles demonstrated!');
}

demoSpinners().catch(console.error);
