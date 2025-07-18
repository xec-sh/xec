import * as path from 'path';
import { promises as fs } from 'fs';

import { ISnapshotStore } from '../interfaces.js';
import { Timestamp, ResourceId, QueryOptions, StateSnapshot } from '../types.js';

export interface FileSnapshotStoreOptions {
  basePath: string;
  maxSnapshotsPerResource?: number;
  compressionEnabled?: boolean;
}

export class FileSnapshotStore implements ISnapshotStore {
  private basePath: string;
  private maxSnapshotsPerResource: number;
  private compressionEnabled: boolean;
  private indexPath: string;
  private index: Map<ResourceId, string[]> = new Map();

  constructor(options: FileSnapshotStoreOptions) {
    this.basePath = options.basePath;
    this.maxSnapshotsPerResource = options.maxSnapshotsPerResource || 10;
    this.compressionEnabled = options.compressionEnabled || false;
    this.indexPath = path.join(this.basePath, 'snapshots', 'index.json');
  }

  async initialize(): Promise<void> {
    // Ensure directories exist
    await fs.mkdir(path.join(this.basePath, 'snapshots'), { recursive: true });
    
    // Load index
    try {
      const indexData = await fs.readFile(this.indexPath, 'utf-8');
      const parsed = JSON.parse(indexData);
      this.index = new Map(Object.entries(parsed));
    } catch (error) {
      // Index doesn't exist, start with empty
      this.index = new Map();
    }
  }

  async saveSnapshot(snapshot: StateSnapshot): Promise<void> {
    // Ensure initialized
    if (this.index.size === 0) {
      await this.initialize();
    }

    // Create snapshot file path
    const resourceDir = path.join(this.basePath, 'snapshots', snapshot.resourceId);
    await fs.mkdir(resourceDir, { recursive: true });
    
    const filename = `${snapshot.timestamp}-v${snapshot.version}.json`;
    const filepath = path.join(resourceDir, filename);
    
    // Serialize snapshot
    const data = JSON.stringify(snapshot, null, 2);
    
    if (this.compressionEnabled) {
      // TODO: Implement compression
      // data = await compress(data);
    }
    
    // Write snapshot file
    await fs.writeFile(filepath, data, 'utf-8');
    
    // Update index
    const resourceSnapshots = this.index.get(snapshot.resourceId) || [];
    resourceSnapshots.push(snapshot.id);
    
    // Sort by timestamp (newest first)
    resourceSnapshots.sort((a, b) => {
      const timestampA = parseInt(a.split('-')[0] || '0');
      const timestampB = parseInt(b.split('-')[0] || '0');
      return timestampB - timestampA;
    });
    
    // Enforce max snapshots limit
    if (resourceSnapshots.length > this.maxSnapshotsPerResource) {
      const toDelete = resourceSnapshots.slice(this.maxSnapshotsPerResource);
      for (const snapshotId of toDelete) {
        const oldFilename = await this.findSnapshotFile(snapshot.resourceId, snapshotId);
        if (oldFilename) {
          await fs.unlink(path.join(resourceDir, oldFilename));
        }
      }
      resourceSnapshots.splice(this.maxSnapshotsPerResource);
    }
    
    this.index.set(snapshot.resourceId, resourceSnapshots);
    await this.saveIndex();
  }

  async getSnapshot(snapshotId: string): Promise<StateSnapshot | null> {
    // Search all resources for the snapshot
    for (const [resourceId, snapshots] of this.index.entries()) {
      if (snapshots.includes(snapshotId)) {
        const filename = await this.findSnapshotFile(resourceId, snapshotId);
        if (filename) {
          const filepath = path.join(this.basePath, 'snapshots', resourceId, filename);
          return await this.loadSnapshot(filepath);
        }
      }
    }
    return null;
  }

  async getLatestSnapshot(resourceId: ResourceId): Promise<StateSnapshot | null> {
    const snapshots = this.index.get(resourceId);
    if (!snapshots || snapshots.length === 0) {
      return null;
    }
    
    // First snapshot in the array is the latest (sorted by timestamp desc)
    const latestId = snapshots[0];
    if (!latestId) return null;
    const filename = await this.findSnapshotFile(resourceId, latestId);
    if (filename) {
      const filepath = path.join(this.basePath, 'snapshots', resourceId, filename);
      return await this.loadSnapshot(filepath);
    }
    
    return null;
  }

  async getSnapshotAt(resourceId: ResourceId, timestamp: Timestamp): Promise<StateSnapshot | null> {
    const resourceDir = path.join(this.basePath, 'snapshots', resourceId);
    
    try {
      const files = await fs.readdir(resourceDir);
      let closestFile: string | null = null;
      let closestTimestamp = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const fileTimestamp = parseInt(file.split('-')[0] || '0');
          if (fileTimestamp <= timestamp && fileTimestamp > closestTimestamp) {
            closestTimestamp = fileTimestamp;
            closestFile = file;
          }
        }
      }
      
      if (closestFile) {
        const filepath = path.join(resourceDir, closestFile);
        return await this.loadSnapshot(filepath);
      }
    } catch (error) {
      // Directory doesn't exist
    }
    
    return null;
  }

  async getSnapshots(resourceId: ResourceId, options?: QueryOptions): Promise<StateSnapshot[]> {
    const resourceDir = path.join(this.basePath, 'snapshots', resourceId);
    const snapshots: StateSnapshot[] = [];
    
    try {
      const files = await fs.readdir(resourceDir);
      const sortedFiles = files
        .filter(f => f.endsWith('.json'))
        .sort((a, b) => {
          const timestampA = parseInt(a.split('-')[0] || '0');
          const timestampB = parseInt(b.split('-')[0] || '0');
          return timestampB - timestampA;
        });
      
      const limit = options?.limit || sortedFiles.length;
      const offset = options?.offset || 0;
      
      for (let i = offset; i < Math.min(offset + limit, sortedFiles.length); i++) {
        const file = sortedFiles[i];
        if (file) {
          const filepath = path.join(resourceDir, file);
          const snapshot = await this.loadSnapshot(filepath);
          if (snapshot) {
            snapshots.push(snapshot);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }
    
    return snapshots;
  }

  async pruneSnapshots(resourceId: ResourceId, keepCount: number): Promise<number> {
    const resourceDir = path.join(this.basePath, 'snapshots', resourceId);
    let deletedCount = 0;
    
    try {
      const files = await fs.readdir(resourceDir);
      const sortedFiles = files
        .filter(f => f.endsWith('.json'))
        .sort((a, b) => {
          const timestampA = parseInt(a.split('-')[0] || '0');
          const timestampB = parseInt(b.split('-')[0] || '0');
          return timestampB - timestampA;
        });
      
      if (sortedFiles.length > keepCount) {
        const toDelete = sortedFiles.slice(keepCount);
        for (const file of toDelete) {
          await fs.unlink(path.join(resourceDir, file));
          deletedCount++;
        }
        
        // Update index
        const snapshots = this.index.get(resourceId);
        if (snapshots) {
          snapshots.splice(keepCount);
          this.index.set(resourceId, snapshots);
          await this.saveIndex();
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }
    
    return deletedCount;
  }

  async getSnapshotsBefore(timestamp: Timestamp): Promise<StateSnapshot[]> {
    const allSnapshots: StateSnapshot[] = [];
    
    for (const [resourceId] of this.index.entries()) {
      const resourceDir = path.join(this.basePath, 'snapshots', resourceId);
      
      try {
        const files = await fs.readdir(resourceDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const fileTimestamp = parseInt(file.split('-')[0] || '0');
            if (fileTimestamp < timestamp) {
              const filepath = path.join(resourceDir, file);
              const snapshot = await this.loadSnapshot(filepath);
              if (snapshot) {
                allSnapshots.push(snapshot);
              }
            }
          }
        }
      } catch (error) {
        // Directory doesn't exist
      }
    }
    
    // Sort by timestamp descending
    allSnapshots.sort((a, b) => b.timestamp - a.timestamp);
    
    return allSnapshots;
  }

  private async loadSnapshot(filepath: string): Promise<StateSnapshot | null> {
    try {
      const data = await fs.readFile(filepath, 'utf-8');
      
      if (this.compressionEnabled) {
        // TODO: Implement decompression
        // data = await decompress(data);
      }
      
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  private async findSnapshotFile(resourceId: ResourceId, snapshotId: string): Promise<string | null> {
    const resourceDir = path.join(this.basePath, 'snapshots', resourceId);
    
    try {
      const files = await fs.readdir(resourceDir);
      for (const file of files) {
        if (file.includes(snapshotId) && file.endsWith('.json')) {
          return file;
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }
    
    return null;
  }

  private async saveIndex(): Promise<void> {
    const indexData = Object.fromEntries(this.index);
    await fs.writeFile(this.indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
  }
}