/**
 * Docker Fluent API - Re-exports from modular structure
 *
 * This file maintains backwards compatibility by re-exporting
 * from the new modular structure in ./docker-fluent-api/
 */

// Re-export types
export * from './docker-fluent-api/types.js';

// Re-export build API
export { DockerBuildFluentAPI } from './docker-fluent-api/build.js';

// Legacy exports for backwards compatibility
export { DockerBuildFluentAPI as DockerFluentBuildAPI } from './docker-fluent-api/build.js';

// Re-export base classes
export {
  BaseDockerFluentAPI,
  DockerEphemeralFluentAPI,
  DockerPersistentFluentAPI
} from './docker-fluent-api/base.js';

// Re-export main API
export {
  DockerFluentAPI,
  DockerSwarmFluentAPI,
  DockerVolumeFluentAPI,
  DockerComposeFluentAPI,
  DockerNetworkFluentAPI
} from './docker-fluent-api/index.js';
