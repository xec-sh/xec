import * as os from 'os';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

/**
 * Get a unique machine identifier across different platforms
 * Returns a consistent UUID for the machine
 */
export async function getMachineId(): Promise<string> {
  const platform = os.platform();
  let rawId = '';

  try {
    switch (platform) {
      case 'darwin': {
        // macOS: Use hardware UUID
        const output = execSync(
          'ioreg -rd1 -c IOPlatformExpertDevice | grep UUID',
          { encoding: 'utf8' }
        );
        const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
        if (match && match[1]) {
          rawId = match[1];
        } else {
          throw new Error('Failed to extract UUID from ioreg output');
        }
        break;
      }

      case 'linux': {
        // Linux: Try multiple sources in order
        const machineIdPaths = [
          '/etc/machine-id',
          '/var/lib/dbus/machine-id',
          '/sys/class/dmi/id/product_uuid'
        ];
        
        let found = false;
        for (const path of machineIdPaths) {
          if (existsSync(path)) {
            rawId = readFileSync(path, 'utf8').trim();
            found = true;
            break;
          }
        }
        
        if (!found) {
          // Fallback: generate from network interfaces
          const interfaces = os.networkInterfaces();
          const macs: string[] = [];
          
          for (const [name, ifaces] of Object.entries(interfaces)) {
            if (name === 'lo') continue; // Skip loopback
            for (const iface of ifaces || []) {
              if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
                macs.push(iface.mac);
              }
            }
          }
          
          if (macs.length > 0) {
            rawId = macs.sort().join(':');
          } else {
            throw new Error('No machine ID sources found on Linux');
          }
        }
        break;
      }

      case 'win32': {
        // Windows: Use WMI to get hardware UUID
        try {
          const output = execSync(
            'wmic csproduct get UUID /value',
            { encoding: 'utf8' }
          );
          const match = output.match(/UUID=([^\r\n]+)/);
          if (match && match[1]) {
            rawId = match[1].trim();
          } else {
            throw new Error('Failed to extract UUID from wmic output');
          }
        } catch (error) {
          // Fallback: Use Windows Product ID
          const productIdOutput = execSync(
            'wmic os get SerialNumber /value',
            { encoding: 'utf8' }
          );
          const productMatch = productIdOutput.match(/SerialNumber=([^\r\n]+)/);
          if (productMatch && productMatch[1]) {
            rawId = productMatch[1].trim();
          } else {
            throw new Error('Failed to get Windows machine ID');
          }
        }
        break;
      }

      default: {
        // Unsupported platform: Generate from hostname + network interfaces
        const hostname = os.hostname();
        const interfaces = os.networkInterfaces();
        const macs: string[] = [];
        
        for (const [name, ifaces] of Object.entries(interfaces)) {
          for (const iface of ifaces || []) {
            if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
              macs.push(iface.mac);
            }
          }
        }
        
        rawId = `${hostname}:${macs.sort().join(':')}`;
        break;
      }
    }

    // Normalize the ID to a consistent format (UUID v5 style)
    // This ensures consistent length and format across platforms
    const hash = createHash('sha256').update(rawId).digest('hex');
    const uuid = [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '5' + hash.substring(13, 16), // Version 5
      hash.substring(16, 20),
      hash.substring(20, 32)
    ].join('-');

    return uuid;
  } catch (error) {
    // Last resort: Use hostname + CPU info + memory
    const fallbackId = [
      os.hostname(),
      os.cpus()[0]?.model || 'unknown',
      os.totalmem().toString(),
      Date.now().toString()
    ].join(':');
    
    const hash = createHash('sha256').update(fallbackId).digest('hex');
    const uuid = [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '5' + hash.substring(13, 16),
      hash.substring(16, 20),
      hash.substring(20, 32)
    ].join('-');
    
    return uuid;
  }
}

/**
 * Cache the machine ID for the session
 */
let cachedMachineId: string | null = null;

/**
 * Get cached machine ID or compute it
 */
export async function getCachedMachineId(): Promise<string> {
  if (!cachedMachineId) {
    cachedMachineId = await getMachineId();
  }
  return cachedMachineId;
}