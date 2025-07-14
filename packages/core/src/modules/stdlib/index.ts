export { utilsModule, metadata as utilsMetadata } from './utils.js';
export { networkModule, metadata as networkMetadata } from './network.js';
export { processModule, metadata as processMetadata } from './process.js';

import { utilsModule } from './utils.js';
import { networkModule } from './network.js';
import { processModule } from './process.js';

export const stdlibModules = {
  network: networkModule,
  process: processModule,
  utils: utilsModule,
};

export default stdlibModules;