export * from './quota-manager.js';
export * from './resource-manager.js';

import { QuotaManager, getQuotaManager, setQuotaManager } from './quota-manager.js';
import { ResourceManager, getResourceManager, setResourceManager } from './resource-manager.js';

export {
  QuotaManager,
  ResourceManager,
  getQuotaManager,
  setQuotaManager,
  getResourceManager,
  setResourceManager
};