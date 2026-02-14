import * as vscode from "vscode";
import type { Collection, MongoClient } from "mongodb";
import { BugRecord } from "./types";

const LOG = "[FlowFixer:Storage]";
const GLOBAL_STATE_KEY = "flowfixer.bugHistory";

export interface StorageProvider {
  save(record: BugRecord): Promise<void>;
  update(record: BugRecord): Promise<void>;
  getAll(): Promise<BugRecord[]>;
  dispose(): void;
}

/**
 * VS Code globalState fallback storage.
 * Always available, no external dependencies.
 */
class GlobalStateStorage implements StorageProvider {
  constructor(private readonly globalState: vscode.Memento) {}

  async save(record: BugRecord): Promise<void> {
    const existing = await this.getAll();
    existing.push(record);
    await this.globalState.update(GLOBAL_STATE_KEY, existing);
    console.log(`${LOG} [globalState] saved bug record: ${record.id}`);
  }

  async update(record: BugRecord): Promise<void> {
    const existing = await this.getAll();
    const index = existing.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      existing[index] = record;
    } else {
      existing.push(record);
    }
    await this.globalState.update(GLOBAL_STATE_KEY, existing);
    console.log(`${LOG} [globalState] updated bug record: ${record.id}`);
  }

  async getAll(): Promise<BugRecord[]> {
    return this.globalState.get<BugRecord[]>(GLOBAL_STATE_KEY, []);
  }

  dispose(): void {
    // nothing to clean up
  }
}

/**
 * MongoDB Atlas storage.
 * Requires mongodb URI stored in context.secrets.
 */
class MongoStorage implements StorageProvider {
  private client: MongoClient | null = null;
  private collection: Collection<BugRecord> | null = null;
  private connected = false;

  constructor(private readonly uri: string) {}

  private async connect(): Promise<boolean> {
    if (this.connected) return true;
    try {
      const { MongoClient } = await import("mongodb");
      this.client = new MongoClient(this.uri, {
        serverSelectionTimeoutMS: 4000,
      });
      await this.client.connect();
      const db = this.client.db("flowfixer");
      this.collection = db.collection<BugRecord>("bugs");
      await db.command({ ping: 1 });
      await this.collection.createIndex({ id: 1 }, { unique: true });
      this.connected = true;
      console.log(`${LOG} [MongoDB] connected`);
      return true;
    } catch (err) {
      console.error(`${LOG} [MongoDB] connection failed:`, err);
      return false;
    }
  }

  async save(record: BugRecord): Promise<void> {
    if (!(await this.connect()) || !this.collection) {
      throw new Error("MongoDB not connected");
    }
    await this.collection.updateOne(
      { id: record.id },
      { $set: record },
      { upsert: true }
    );
    console.log(`${LOG} [MongoDB] saved bug record: ${record.id}`);
  }

  async update(record: BugRecord): Promise<void> {
    await this.save(record);
  }

  async getAll(): Promise<BugRecord[]> {
    if (!(await this.connect()) || !this.collection) {
      throw new Error("MongoDB not connected");
    }
    return this.collection.find({}).sort({ timestamp: 1 }).toArray();
  }

  async ping(): Promise<boolean> {
    return this.connect();
  }

  dispose(): void {
    if (this.client) {
      void this.client.close().catch(() => {});
      this.client = null;
      this.collection = null;
      this.connected = false;
    }
  }
}

/**
 * Combined storage: tries MongoDB first, falls back to globalState.
 */
export class FlowFixerStorage implements StorageProvider {
  private mongo: MongoStorage | null = null;
  private globalStateStorage: GlobalStateStorage;

  constructor(
    globalState: vscode.Memento,
    mongoUri?: string
  ) {
    this.globalStateStorage = new GlobalStateStorage(globalState);
    if (mongoUri) {
      this.mongo = new MongoStorage(mongoUri);
    }
  }

  setMongoUri(mongoUri?: string): void {
    this.mongo?.dispose();
    this.mongo = mongoUri ? new MongoStorage(mongoUri) : null;
  }

  async testMongoConnection(): Promise<boolean> {
    if (!this.mongo) return false;
    return this.mongo.ping();
  }

  async syncLocalToMongo(): Promise<number> {
    if (!this.mongo) return 0;

    const local = await this.globalStateStorage.getAll();
    let synced = 0;

    for (const record of local) {
      try {
        await this.mongo.save(record);
        synced++;
      } catch (err) {
        console.warn(`${LOG} sync to MongoDB failed for ${record.id}:`, err);
      }
    }

    return synced;
  }

  async save(record: BugRecord): Promise<void> {
    // Always save to globalState
    await this.globalStateStorage.save(record);

    // Try MongoDB too
    if (this.mongo) {
      try {
        await this.mongo.save(record);
      } catch (err) {
        console.warn(`${LOG} MongoDB save failed, globalState has it:`, err);
      }
    }
  }

  async update(record: BugRecord): Promise<void> {
    await this.globalStateStorage.update(record);

    if (this.mongo) {
      try {
        await this.mongo.update(record);
      } catch (err) {
        console.warn(`${LOG} MongoDB update failed, globalState has it:`, err);
      }
    }
  }

  async getAll(): Promise<BugRecord[]> {
    const local = await this.globalStateStorage.getAll();

    // Try MongoDB first for richer/cross-device data
    if (this.mongo) {
      try {
        const remote = await this.mongo.getAll();
        const merged = [...remote];
        const seen = new Set(remote.map((bug) => bug.id));
        for (const bug of local) {
          if (!seen.has(bug.id)) {
            merged.push(bug);
          }
        }
        merged.sort((a, b) => a.timestamp - b.timestamp);
        return merged;
      } catch {
        console.warn(`${LOG} MongoDB read failed, falling back to globalState`);
      }
    }
    return local;
  }

  dispose(): void {
    this.mongo?.dispose();
    this.globalStateStorage.dispose();
  }
}
