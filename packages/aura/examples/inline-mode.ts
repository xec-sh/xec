export interface IPosition {
  readonly x: number;
  readonly y: number;
}

const ESC = '\x1b[';
const CSI = ESC;

let currentPosition: IPosition = { x: 0, y: 0 };

function write(data: string): void {
  process.stdout.write(data);
}
async function requestPosition() {
  return new Promise((resolve) => {
    const handler = (data: Buffer): void => {
      const match = /\[(\d+);(\d+)R/.exec(data.toString());
      if (match && match[1] && match[2]) {
        const y = parseInt(match[1], 10) - 1;
        const x = parseInt(match[2], 10) - 1;
        currentPosition = { x, y };
        process.stdin.off('data', handler);
        resolve({ x, y });
      }
    };

    process.stdin.on('data', handler);
    write(`${CSI}6n`);

    // Timeout after 100ms
    setTimeout(() => {
      process.stdin.off('data', handler);
      resolve(currentPosition);
    }, 50);
  });
}

async function main() {
  process.stdin.setRawMode(true);
  const position = await requestPosition();
  process.stdin.setRawMode(false);
  console.log(position);
  process.exit(0);
}

main().catch(console.error);