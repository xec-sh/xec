import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import { ILedger, IStorageAdapter } from './interfaces';
import {
  ResourceId,
  LedgerEntry,
  MerkleProof,
  QueryOptions,
} from './types.js';

export class Ledger implements ILedger {
  private storage: IStorageAdapter;
  private sequenceNumber: number = 0;
  private currentMerkleRoot: string = '';
  private merkleTree: MerkleTree;

  constructor(storage: IStorageAdapter) {
    this.storage = storage;
    this.merkleTree = new MerkleTree();
  }

  async initialize(): Promise<void> {
    // Storage should already be connected
    const seq = await this.storage.get('ledger:meta:sequence');
    if (seq) {
      this.sequenceNumber = seq;
      const lastEntry = await this.getLastEntry();
      if (lastEntry) {
        this.currentMerkleRoot = lastEntry.proof?.root || '';
        await this.rebuildMerkleTree();
      }
    }
  }

  async append(entry: Omit<LedgerEntry, 'id' | 'hash' | 'sequenceNumber' | 'previousHash'>): Promise<LedgerEntry> {
    const id = uuidv4();
    
    // Get the latest sequence number from storage
    const currentSeq = await this.storage.get('ledger:meta:sequence') || 0;
    this.sequenceNumber = currentSeq;
    
    const sequenceNumber = ++this.sequenceNumber;

    const lastEntry = await this.getLastEntry();
    const previousHash = lastEntry ? lastEntry.hash : this.genesisHash();

    const fullEntry: LedgerEntry = {
      ...entry,
      id,
      sequenceNumber,
      previousHash,
      hash: '', // Will be computed below
    };

    fullEntry.hash = this.computeHash(fullEntry);

    this.merkleTree.addLeaf(fullEntry.hash);
    const proof = this.merkleTree.getProof(fullEntry.hash);
    fullEntry.proof = proof;

    this.currentMerkleRoot = proof.root;

    await this.storage.set(this.getEntryKey(id), fullEntry);
    await this.storage.set(this.getSequenceKey(sequenceNumber), id);
    await this.storage.set('ledger:meta:sequence', sequenceNumber);
    await this.storage.set('ledger:meta:merkleRoot', this.currentMerkleRoot);

    await this.updateIndexes(fullEntry);

    return fullEntry;
  }

  async getEntry(entryId: string): Promise<LedgerEntry | null> {
    const key = this.getEntryKey(entryId);
    return await this.storage.get(key);
  }

  async getEntries(options?: QueryOptions): Promise<LedgerEntry[]> {
    const entries: LedgerEntry[] = [];
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const orderDirection = options?.orderDirection || 'asc';

    // Ensure we have the latest sequence number
    const seq = await this.storage.get('ledger:meta:sequence');
    if (seq) {
      this.sequenceNumber = seq;
    }

    const startSeq = orderDirection === 'asc' ? offset + 1 : this.sequenceNumber - offset;
    const endSeq = orderDirection === 'asc'
      ? Math.min(startSeq + limit - 1, this.sequenceNumber)
      : Math.max(startSeq - limit + 1, 1);

    for (let seq = startSeq; orderDirection === 'asc' ? seq <= endSeq : seq >= endSeq; orderDirection === 'asc' ? seq++ : seq--) {
      const id = await this.storage.get(this.getSequenceKey(seq));
      if (id) {
        const entry = await this.getEntry(id);
        if (entry) {
          entries.push(entry);
        }
      }
    }

    return entries;
  }

  async getEntriesByResource(resourceId: ResourceId, options?: QueryOptions): Promise<LedgerEntry[]> {
    const indexKey = `ledger:index:resource:${resourceId}`;
    const entryIds = await this.storage.get(indexKey) || [];

    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const slice = entryIds.slice(offset, offset + limit);

    const entries = await Promise.all(
      slice.map((id: string) => this.getEntry(id))
    );

    return entries.filter(e => e !== null) as LedgerEntry[];
  }

  async getLastEntry(): Promise<LedgerEntry | null> {
    // Always check storage for latest sequence number
    const seq = await this.storage.get('ledger:meta:sequence');
    if (!seq || seq === 0) {
      return null;
    }
    
    // Update local cache
    this.sequenceNumber = seq;

    const id = await this.storage.get(this.getSequenceKey(this.sequenceNumber));
    if (!id) return null;

    return await this.getEntry(id);
  }

  async verify(entryId: string): Promise<boolean> {
    const entry = await this.getEntry(entryId);
    if (!entry) return false;

    const computedHash = this.computeHash(entry);
    if (computedHash !== entry.hash) return false;

    if (entry.sequenceNumber > 1) {
      const prevId = await this.storage.get(this.getSequenceKey(entry.sequenceNumber - 1));
      if (prevId) {
        const prevEntry = await this.getEntry(prevId);
        if (prevEntry && prevEntry.hash !== entry.previousHash) {
          return false;
        }
      }
    }

    if (entry.proof) {
      return await this.verifyMerkleProof(entryId, entry.proof);
    }

    return true;
  }

  async verifyChain(fromEntry?: string, toEntry?: string): Promise<boolean> {
    let startSeq = 1;
    let endSeq = this.sequenceNumber;

    if (fromEntry) {
      const from = await this.getEntry(fromEntry);
      if (from) startSeq = from.sequenceNumber;
    }

    if (toEntry) {
      const to = await this.getEntry(toEntry);
      if (to) endSeq = to.sequenceNumber;
    }

    // If we don't have any entries yet, the chain is valid
    if (this.sequenceNumber === 0) {
      const seq = await this.storage.get('ledger:meta:sequence');
      if (!seq || seq === 0) {
        return true;
      }
      this.sequenceNumber = seq;
    }

    let previousHash = '';
    
    if (startSeq === 1) {
      previousHash = this.genesisHash();
    } else {
      const prevId = await this.storage.get(this.getSequenceKey(startSeq - 1));
      if (prevId) {
        const prevEntry = await this.getEntry(prevId);
        if (prevEntry) {
          previousHash = prevEntry.hash;
        }
      }
    }

    for (let seq = startSeq; seq <= endSeq; seq++) {
      const id = await this.storage.get(this.getSequenceKey(seq));
      if (!id) return false;

      const entry = await this.getEntry(id);
      if (!entry) return false;

      if (entry.previousHash !== previousHash) {
        return false;
      }

      const computedHash = this.computeHash(entry);
      if (computedHash !== entry.hash) {
        return false;
      }

      previousHash = entry.hash;
    }

    return true;
  }

  async getMerkleProof(entryId: string): Promise<MerkleProof> {
    const entry = await this.getEntry(entryId);
    if (!entry || !entry.hash) {
      throw new Error('Entry not found');
    }

    return this.merkleTree.getProof(entry.hash);
  }

  async verifyMerkleProof(entryId: string, proof: MerkleProof): Promise<boolean> {
    const entry = await this.getEntry(entryId);
    if (!entry || !entry.hash) return false;

    return MerkleTree.verifyProof(entry.hash, proof);
  }

  private computeHash(entry: LedgerEntry): string {
    const content = JSON.stringify({
      timestamp: entry.timestamp,
      sequenceNumber: entry.sequenceNumber,
      operation: entry.operation,
      resource: entry.resource,
      previousState: entry.previousState,
      newState: entry.newState,
      previousHash: entry.previousHash,
      eventId: entry.event.id,
    });

    return createHash('sha256').update(content).digest('hex');
  }

  private genesisHash(): string {
    return createHash('sha256').update('GENESIS').digest('hex');
  }

  private getEntryKey(entryId: string): string {
    return `ledger:entries:${entryId}`;
  }

  private getSequenceKey(sequence: number): string {
    return `ledger:sequence:${sequence}`;
  }

  private async updateIndexes(entry: LedgerEntry): Promise<void> {
    // Index by resource ID directly (not including type)
    const resourceId = entry.resource.id;
    const indexKey = `ledger:index:resource:${resourceId}`;

    const existing = await this.storage.get(indexKey) || [];
    existing.push(entry.id);

    await this.storage.set(indexKey, existing);

    if (entry.operation) {
      const opIndexKey = `ledger:index:operation:${entry.operation}`;
      const opExisting = await this.storage.get(opIndexKey) || [];
      opExisting.push(entry.id);
      await this.storage.set(opIndexKey, opExisting);
    }
  }

  private async rebuildMerkleTree(): Promise<void> {
    this.merkleTree = new MerkleTree();

    for (let seq = 1; seq <= this.sequenceNumber; seq++) {
      const id = await this.storage.get(this.getSequenceKey(seq));
      if (id) {
        const entry = await this.getEntry(id);
        if (entry && entry.hash) {
          this.merkleTree.addLeaf(entry.hash);
        }
      }
    }
  }
}

class MerkleTree {
  private leaves: string[] = [];
  private levels: string[][] = [];

  addLeaf(hash: string): void {
    this.leaves.push(hash);
    this.buildTree();
  }

  getRoot(): string {
    if (this.levels.length === 0) return '';
    const lastLevel = this.levels[this.levels.length - 1];
    return lastLevel?.[0] || '';
  }

  getProof(leafHash: string): MerkleProof {
    const index = this.leaves.indexOf(leafHash);
    if (index === -1) {
      throw new Error('Leaf not found in tree');
    }

    const proof: MerkleProof = {
      root: this.getRoot(),
      path: [],
      siblings: [],
      algorithm: 'sha256',
    };

    let currentIndex = index;
    for (let level = 0; level < this.levels.length - 1; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
      const currentLevel = this.levels[level];

      if (currentLevel && siblingIndex < currentLevel.length) {
        const sibling = currentLevel[siblingIndex];
        if (sibling) {
          proof.siblings.push(sibling);
          proof.path.push(isLeft ? 'L' : 'R');
        }
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  static verifyProof(leafHash: string, proof: MerkleProof): boolean {
    let currentHash = leafHash;

    for (let i = 0; i < proof.siblings.length; i++) {
      const sibling = proof.siblings[i];
      const position = proof.path[i];

      const combined = position === 'L'
        ? currentHash + sibling
        : sibling + currentHash;

      currentHash = createHash(proof.algorithm).update(combined).digest('hex');
    }

    return currentHash === proof.root;
  }

  private buildTree(): void {
    this.levels = [this.leaves];

    while (this.levels.length > 0 && this.levels[this.levels.length - 1] && this.levels[this.levels.length - 1]!.length > 1) {
      const currentLevel = this.levels[this.levels.length - 1];
      const nextLevel: string[] = [];

      if (currentLevel) {
        for (let i = 0; i < currentLevel.length; i += 2) {
          const left = currentLevel[i];
          const right = currentLevel[i + 1] || left;
          if (left && right) {
            const combined = left + right;
            const hash = createHash('sha256').update(combined).digest('hex');
            nextLevel.push(hash);
          }
        }
      }

      this.levels.push(nextLevel);
    }
  }
}