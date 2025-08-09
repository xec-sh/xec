/**
 * Feature flags configuration for Xec CLI
 * Controls progressive migration to @xec-sh/kit
 */

export interface Features {
  // Core features
  useKit: boolean;
  
  // UI components
  useKitForms: boolean;
  useKitWizards: boolean;
  useKitPanels: boolean;
  
  // Advanced features
  useKitFileExplorer: boolean;
  useKitTaskRunner: boolean;
  useKitLiveOutput: boolean;
  useKitCommandPalette: boolean;
  
  // Debug mode
  debugKit: boolean;
}

/**
 * Check if a feature is enabled via environment variable
 */
function isEnabled(envVar: string, defaultValue = false): boolean {
  const value = process.env[envVar];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Feature flags for progressive migration to @xec-sh/kit
 */
export const features: Features = {
  // Enable kit globally
  useKit: isEnabled('XEC_USE_KIT', false),
  
  // UI components
  useKitForms: isEnabled('XEC_KIT_FORMS', false),
  useKitWizards: isEnabled('XEC_KIT_WIZARDS', false),
  useKitPanels: isEnabled('XEC_KIT_PANELS', false),
  
  // Advanced features - enabled by default when kit is enabled
  useKitFileExplorer: isEnabled('XEC_KIT_FILE_EXPLORER', true),
  useKitTaskRunner: isEnabled('XEC_KIT_TASK_RUNNER', true),
  useKitLiveOutput: isEnabled('XEC_KIT_LIVE_OUTPUT', true),
  useKitCommandPalette: isEnabled('XEC_KIT_COMMAND_PALETTE', true),
  
  // Debug mode
  debugKit: isEnabled('XEC_KIT_DEBUG', false),
};

/**
 * Get current feature flags
 */
export function getFeatures(): Features {
  return features;
}

/**
 * Check if kit should be used (any kit feature is enabled)
 */
export function shouldUseKit(): boolean {
  return Object.values(features).some(enabled => enabled);
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof Features): boolean {
  return features[feature];
}

/**
 * Enable a feature programmatically (for testing)
 */
export function enableFeature(feature: keyof Features): void {
  features[feature] = true;
}

/**
 * Disable a feature programmatically (for testing)
 */
export function disableFeature(feature: keyof Features): void {
  features[feature] = false;
}

// Export default for convenience
export default features;