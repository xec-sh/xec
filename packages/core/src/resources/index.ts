export * from './resource-manager.js';
export * from './quota-manager.js';

import { ResourceManager, getResourceManager, setResourceManager } from './resource-manager.js';
import { QuotaManager, getQuotaManager, setQuotaManager } from './quota-manager.js';

export {
  ResourceManager,
  QuotaManager,
  getResourceManager,
  setResourceManager,
  getQuotaManager,
  setQuotaManager
};