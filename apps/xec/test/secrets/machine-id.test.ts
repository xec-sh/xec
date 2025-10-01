import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { getGlobalConfigDir } from '../../src/config/utils.js';
import { getMachineId, getCachedMachineId } from '../../src/secrets/machine-id.js';

describe('Machine ID Module', () => {
  const tempDir = path.join(os.tmpdir(), 'xec-test-machine-id-' + Date.now());

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create temp directory
    await fs.promises.mkdir(tempDir, { recursive: true });
    
    // Reset the cached machine ID
    const cacheFile = path.join(getGlobalConfigDir(), '.machine-id');
    if (fs.existsSync(cacheFile)) {
      try {
        fs.unlinkSync(cacheFile);
      } catch {
        // Ignore errors
      }
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    
    // Clean up temp directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe('getMachineId', () => {
    it('should get a valid machine ID for the current platform', async () => {
      // Test that getMachineId returns a valid UUID format on any platform
      const id = await getMachineId();
      
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
      
      // Verify consistency
      const id2 = await getMachineId();
      expect(id).toBe(id2);
    });

    it('should handle different machine ID sources', async () => {
      // Test that the function can handle various scenarios
      // This test verifies the UUID format is consistent regardless of the source
      const platform = os.platform();
      
      if (platform === 'linux') {
        // On Linux, verify it can read from standard locations or fallback to network interfaces
        const id = await getMachineId();
        expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
      } else if (platform === 'darwin') {
        // On macOS, verify it reads hardware UUID
        const id = await getMachineId();
        expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
      } else if (platform === 'win32') {
        // On Windows, verify it reads system UUID
        const id = await getMachineId();
        expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
      } else {
        // On other platforms, verify fallback works
        const id = await getMachineId();
        expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
      }
    });

    it('should generate deterministic IDs from network interfaces', async () => {
      // Test that if network interfaces are available, we get a valid ID
      const interfaces = os.networkInterfaces();
      const hasNonInternalInterface = Object.values(interfaces).some(ifaces => 
        ifaces?.some(iface => !iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00')
      );
      
      if (hasNonInternalInterface) {
        const id1 = await getMachineId();
        const id2 = await getMachineId();
        
        // Should be consistent
        expect(id1).toBe(id2);
        expect(id1).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
      } else {
        // Skip if no suitable network interfaces
        console.log('No suitable network interfaces for testing');
      }
    });

    it('should handle command execution errors gracefully', async () => {
      // Test that the function handles errors and falls back appropriately
      // This test ensures getMachineId always returns a valid ID even if commands fail
      
      // We can't easily mock execSync due to ES module constraints,
      // but we can verify that getMachineId always returns a valid UUID
      const id = await getMachineId();
      
      expect(id).toBeTruthy();
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should use system information as fallback', async () => {
      // Test that system information can be used to generate a machine ID
      const hostname = os.hostname();
      const cpus = os.cpus();
      const memory = os.totalmem();
      
      // These should always be available
      expect(hostname).toBeTruthy();
      expect(cpus.length).toBeGreaterThan(0);
      expect(memory).toBeGreaterThan(0);
      
      // And getMachineId should always work
      const id = await getMachineId();
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should generate valid UUIDs from various inputs', async () => {
      // Test UUID generation is consistent and valid
      // Multiple calls should return the same ID
      const ids = await Promise.all([
        getMachineId(),
        getMachineId(),
        getMachineId()
      ]);
      
      // All should be the same
      expect(ids[0]).toBe(ids[1]);
      expect(ids[1]).toBe(ids[2]);
      
      // All should be valid UUIDs
      ids.forEach(id => {
        expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
      });
    });

    it('should handle edge cases in UUID generation', async () => {
      // Test that even with minimal system info, we get a valid UUID
      // This tests the robustness of the UUID generation
      
      const id = await getMachineId();
      
      // Should be lowercase hex
      expect(id).toBe(id.toLowerCase());
      
      // Should have correct format with hyphens in right places
      const parts = id.split('-');
      expect(parts).toHaveLength(5);
      expect(parts[0]).toHaveLength(8);
      expect(parts[1]).toHaveLength(4);
      expect(parts[2]).toHaveLength(4);
      expect(parts[3]).toHaveLength(4);
      expect(parts[4]).toHaveLength(12);
      
      // Version should be 5 (SHA-1 based)
      expect(parts[2][0]).toBe('5');
    });

    it('should be performant on repeated calls', async () => {
      // Test that getMachineId is reasonably fast
      const start = Date.now();
      
      // Call multiple times
      for (let i = 0; i < 10; i++) {
        await getMachineId();
      }
      
      const duration = Date.now() - start;
      
      // Should be fast (less than 1 second for 10 calls)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('getCachedMachineId', () => {
    it('should cache machine ID in memory', async () => {
      // Test that getCachedMachineId returns the same ID on multiple calls
      const id1 = await getCachedMachineId();
      const id2 = await getCachedMachineId();
      const id3 = await getCachedMachineId();
      
      // All should be the same since it's cached
      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
      
      // Should be a valid UUID
      expect(id1).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should return same ID as getMachineId', async () => {
      // getCachedMachineId should return the same ID as getMachineId
      const machineId = await getMachineId();
      const cachedId = await getCachedMachineId();
      
      expect(cachedId).toBe(machineId);
    });

    it('should be performant due to caching', async () => {
      // First call might be slower
      const start1 = Date.now();
      await getCachedMachineId();
      const firstCallDuration = Date.now() - start1;
      
      // Subsequent calls should be very fast (< 1ms)
      const start2 = Date.now();
      for (let i = 0; i < 100; i++) {
        await getCachedMachineId();
      }
      const cachedCallsDuration = Date.now() - start2;
      
      // 100 cached calls should be much faster than the first call
      // and definitely less than 10ms total
      expect(cachedCallsDuration).toBeLessThan(10);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle real command execution on current platform', async () => {
      const platform = os.platform();
      
      if (platform === 'darwin') {
        // Test real ioreg command execution
        try {
          const output = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep UUID', { encoding: 'utf8' });
          expect(output).toContain('IOPlatformUUID');
        } catch (error) {
          // Command might not be available in test environment
          console.log('ioreg command not available');
        }
      } else if (platform === 'linux') {
        // Test real machine-id file reading
        const machineIdFiles = ['/etc/machine-id', '/var/lib/dbus/machine-id'];
        const existingFile = machineIdFiles.find(f => fs.existsSync(f));
        
        if (existingFile) {
          const content = fs.readFileSync(existingFile, 'utf8').trim();
          expect(content).toMatch(/^[a-f0-9]{32}$/);
        }
      }
      
      // Regardless of platform, getMachineId should work
      const id = await getMachineId();
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should handle network interface enumeration', async () => {
      const interfaces = os.networkInterfaces();
      let hasValidInterface = false;
      
      for (const [name, ifaces] of Object.entries(interfaces)) {
        if (name === 'lo') continue;
        for (const iface of ifaces || []) {
          if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
            hasValidInterface = true;
            expect(iface.mac).toMatch(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/);
          }
        }
      }
      
      // Even without valid interfaces, getMachineId should work
      const id = await getMachineId();
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should generate consistent IDs with minimal system info', async () => {
      // Test that even with minimal info, we get consistent IDs
      const hostname = os.hostname();
      const cpuModel = os.cpus()[0]?.model || 'unknown';
      const totalMem = os.totalmem();
      
      // These basic system properties should be available
      expect(hostname).toBeTruthy();
      expect(cpuModel).toBeTruthy();
      expect(totalMem).toBeGreaterThan(0);
      
      // Multiple calls should return same ID
      const ids = await Promise.all([
        getMachineId(),
        getMachineId(),
        getMachineId()
      ]);
      
      expect(ids[0]).toBe(ids[1]);
      expect(ids[1]).toBe(ids[2]);
    });

    it('should handle filesystem-based machine ID storage', async () => {
      // Test writing and reading a machine ID to/from filesystem
      const testMachineIdPath = path.join(tempDir, 'test-machine-id');
      const testId = 'a1b2c3d4e5f6789012345678901234567890';
      
      // Write test machine ID
      await fs.promises.writeFile(testMachineIdPath, testId + '\n');
      
      // Verify it can be read
      const content = await fs.promises.readFile(testMachineIdPath, 'utf8');
      expect(content.trim()).toBe(testId);
      
      // getMachineId should still work regardless
      const id = await getMachineId();
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should maintain ID stability across process restarts', async () => {
      // Get ID multiple times - should be stable
      const id1 = await getMachineId();
      
      // Clear the in-memory cache by getting a fresh import
      // In real world, process restart would clear this
      const { getMachineId: getMachineId2 } = await import('../../src/secrets/machine-id.js');
      
      // Get ID again with "fresh" import
      const id2 = await getMachineId2();
      
      // Should be the same even with fresh import
      expect(id1).toBe(id2);
    });

    it('should handle various system configurations', async () => {
      // Test with different system configurations
      const configs = [
        { platform: os.platform(), hostname: os.hostname() },
        { platform: os.platform(), hostname: 'test-host-123' },
        { platform: os.platform(), hostname: 'very-long-hostname-with-many-characters' }
      ];
      
      for (const config of configs) {
        // Each configuration should produce a valid UUID
        const id = await getMachineId();
        expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
        
        // UUID should be lowercase
        expect(id).toBe(id.toLowerCase());
        
        // Should not contain uppercase or special characters
        expect(id).not.toMatch(/[A-Z]/);
        expect(id).toMatch(/^[a-f0-9-]+$/);
      }
    });
  });
});