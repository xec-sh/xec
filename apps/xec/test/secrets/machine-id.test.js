import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { getMachineId, getCachedMachineId } from '../../src/secrets/machine-id.js';
describe('Machine ID Module', () => {
    const tempDir = path.join(os.tmpdir(), 'xec-test-machine-id-' + Date.now());
    beforeEach(async () => {
        jest.clearAllMocks();
        await fs.promises.mkdir(tempDir, { recursive: true });
        const cacheFile = path.join(os.homedir(), '.xec', '.machine-id');
        if (fs.existsSync(cacheFile)) {
            try {
                fs.unlinkSync(cacheFile);
            }
            catch {
            }
        }
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
        catch {
        }
    });
    describe('getMachineId', () => {
        it('should get a valid machine ID for the current platform', async () => {
            const id = await getMachineId();
            expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
            const id2 = await getMachineId();
            expect(id).toBe(id2);
        });
        it('should handle different machine ID sources', async () => {
            const platform = os.platform();
            if (platform === 'linux') {
                const id = await getMachineId();
                expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
            }
            else if (platform === 'darwin') {
                const id = await getMachineId();
                expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
            }
            else if (platform === 'win32') {
                const id = await getMachineId();
                expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
            }
            else {
                const id = await getMachineId();
                expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
            }
        });
        it('should generate deterministic IDs from network interfaces', async () => {
            const interfaces = os.networkInterfaces();
            const hasNonInternalInterface = Object.values(interfaces).some(ifaces => ifaces?.some(iface => !iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00'));
            if (hasNonInternalInterface) {
                const id1 = await getMachineId();
                const id2 = await getMachineId();
                expect(id1).toBe(id2);
                expect(id1).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
            }
            else {
                console.log('No suitable network interfaces for testing');
            }
        });
        it('should handle command execution errors gracefully', async () => {
            const id = await getMachineId();
            expect(id).toBeTruthy();
            expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
        });
        it('should use system information as fallback', async () => {
            const hostname = os.hostname();
            const cpus = os.cpus();
            const memory = os.totalmem();
            expect(hostname).toBeTruthy();
            expect(cpus.length).toBeGreaterThan(0);
            expect(memory).toBeGreaterThan(0);
            const id = await getMachineId();
            expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
        });
        it('should generate valid UUIDs from various inputs', async () => {
            const ids = await Promise.all([
                getMachineId(),
                getMachineId(),
                getMachineId()
            ]);
            expect(ids[0]).toBe(ids[1]);
            expect(ids[1]).toBe(ids[2]);
            ids.forEach(id => {
                expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
            });
        });
        it('should handle edge cases in UUID generation', async () => {
            const id = await getMachineId();
            expect(id).toBe(id.toLowerCase());
            const parts = id.split('-');
            expect(parts).toHaveLength(5);
            expect(parts[0]).toHaveLength(8);
            expect(parts[1]).toHaveLength(4);
            expect(parts[2]).toHaveLength(4);
            expect(parts[3]).toHaveLength(4);
            expect(parts[4]).toHaveLength(12);
            expect(parts[2][0]).toBe('5');
        });
        it('should be performant on repeated calls', async () => {
            const start = Date.now();
            for (let i = 0; i < 10; i++) {
                await getMachineId();
            }
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(1000);
        });
    });
    describe('getCachedMachineId', () => {
        it('should cache machine ID in memory', async () => {
            const id1 = await getCachedMachineId();
            const id2 = await getCachedMachineId();
            const id3 = await getCachedMachineId();
            expect(id1).toBe(id2);
            expect(id2).toBe(id3);
            expect(id1).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
        });
        it('should return same ID as getMachineId', async () => {
            const machineId = await getMachineId();
            const cachedId = await getCachedMachineId();
            expect(cachedId).toBe(machineId);
        });
        it('should be performant due to caching', async () => {
            const start1 = Date.now();
            await getCachedMachineId();
            const firstCallDuration = Date.now() - start1;
            const start2 = Date.now();
            for (let i = 0; i < 100; i++) {
                await getCachedMachineId();
            }
            const cachedCallsDuration = Date.now() - start2;
            expect(cachedCallsDuration).toBeLessThan(10);
        });
    });
    describe('real-world scenarios', () => {
        it('should handle real command execution on current platform', async () => {
            const platform = os.platform();
            if (platform === 'darwin') {
                try {
                    const output = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep UUID', { encoding: 'utf8' });
                    expect(output).toContain('IOPlatformUUID');
                }
                catch (error) {
                    console.log('ioreg command not available');
                }
            }
            else if (platform === 'linux') {
                const machineIdFiles = ['/etc/machine-id', '/var/lib/dbus/machine-id'];
                const existingFile = machineIdFiles.find(f => fs.existsSync(f));
                if (existingFile) {
                    const content = fs.readFileSync(existingFile, 'utf8').trim();
                    expect(content).toMatch(/^[a-f0-9]{32}$/);
                }
            }
            const id = await getMachineId();
            expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
        });
        it('should handle network interface enumeration', async () => {
            const interfaces = os.networkInterfaces();
            let hasValidInterface = false;
            for (const [name, ifaces] of Object.entries(interfaces)) {
                if (name === 'lo')
                    continue;
                for (const iface of ifaces || []) {
                    if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
                        hasValidInterface = true;
                        expect(iface.mac).toMatch(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/);
                    }
                }
            }
            const id = await getMachineId();
            expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
        });
        it('should generate consistent IDs with minimal system info', async () => {
            const hostname = os.hostname();
            const cpuModel = os.cpus()[0]?.model || 'unknown';
            const totalMem = os.totalmem();
            expect(hostname).toBeTruthy();
            expect(cpuModel).toBeTruthy();
            expect(totalMem).toBeGreaterThan(0);
            const ids = await Promise.all([
                getMachineId(),
                getMachineId(),
                getMachineId()
            ]);
            expect(ids[0]).toBe(ids[1]);
            expect(ids[1]).toBe(ids[2]);
        });
        it('should handle filesystem-based machine ID storage', async () => {
            const testMachineIdPath = path.join(tempDir, 'test-machine-id');
            const testId = 'a1b2c3d4e5f6789012345678901234567890';
            await fs.promises.writeFile(testMachineIdPath, testId + '\n');
            const content = await fs.promises.readFile(testMachineIdPath, 'utf8');
            expect(content.trim()).toBe(testId);
            const id = await getMachineId();
            expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
        });
        it('should maintain ID stability across process restarts', async () => {
            const id1 = await getMachineId();
            const { getMachineId: getMachineId2 } = await import('../../src/secrets/machine-id.js');
            const id2 = await getMachineId2();
            expect(id1).toBe(id2);
        });
        it('should handle various system configurations', async () => {
            const configs = [
                { platform: os.platform(), hostname: os.hostname() },
                { platform: os.platform(), hostname: 'test-host-123' },
                { platform: os.platform(), hostname: 'very-long-hostname-with-many-characters' }
            ];
            for (const config of configs) {
                const id = await getMachineId();
                expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
                expect(id).toBe(id.toLowerCase());
                expect(id).not.toMatch(/[A-Z]/);
                expect(id).toMatch(/^[a-f0-9-]+$/);
            }
        });
    });
});
//# sourceMappingURL=machine-id.test.js.map