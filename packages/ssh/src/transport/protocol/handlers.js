import { HANDLERS } from './kex.js';
import miscellaneous from './handlers.misc.js';

let handlers;
// Construct after module initialization; KEX and ordinary packet dispatch share
// this one table without CommonJS cycle-dependent partial exports.
export function getMessageHandlers() {
  if (!handlers) {
    handlers = new Array(256);
    for (const source of [HANDLERS, miscellaneous]) {
      for (const [type, handler] of Object.entries(source)) {
        const index = Number(type);
        if (Number.isInteger(index) && index >= 0 && index < 256) handlers[index] = handler;
      }
    }
  }
  return handlers;
}
