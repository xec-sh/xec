/**
 * Built-in Xec Modules
 * 
 * A comprehensive collection of modules for infrastructure automation,
 * deployment, monitoring, and operations.
 */

// Cloud Providers
export { default as awsModule } from './cloud/aws.js';
// export { default as azureModule } from './cloud/azure.js';
// export { default as gcpModule } from './cloud/gcp.js';

// Container Orchestration
export { default as k8sModule } from './kubernetes/k8s.js';
export { default as dockerModule } from './docker/docker.js';

// Monitoring & Observability
export { default as monitoringModule } from './monitoring/monitoring.js';

// Security & Compliance
// export { default as securityModule } from './security/security.js';

// Database Management
// export { default as databaseModule } from './database/database.js';

// CI/CD
// export { default as cicdModule } from './cicd/cicd.js';

// Re-export all modules as a collection
import awsModule from './cloud/aws.js';
import k8sModule from './kubernetes/k8s.js';
import dockerModule from './docker/docker.js';
import monitoringModule from './monitoring/monitoring.js';

export const builtinModules = {
  aws: awsModule,
  k8s: k8sModule,
  docker: dockerModule,
  monitoring: monitoringModule,
};

// Helper to load all built-in modules
export async function loadBuiltinModules() {
  return builtinModules;
}

// Helper to get a specific built-in module
export function getBuiltinModule(name: string) {
  return builtinModules[name as keyof typeof builtinModules];
}