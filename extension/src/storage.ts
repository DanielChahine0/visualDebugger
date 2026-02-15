import * as vscode from "vscode";
import { BugRecord } from "./types";

const LOG = "[FlowFixer:Storage]";
const GLOBAL_STATE_KEY = "visualdebugger.bugHistory";

export interface StorageProvider {
  save(record: BugRecord): Promise<void>;
  update(record: BugRecord): Promise<void>;
  getAll(): Promise<BugRecord[]>;
  dispose(): void;
}

/**
 * VS Code globalState-backed storage.
 * Always available, no external dependencies.
 */
export class FlowFixerStorage implements StorageProvider {
  constructor(private readonly globalState: vscode.Memento) {}

  async save(record: BugRecord): Promise<void> {
    const existing = await this.getAll();
    existing.push(record);
    await this.globalState.update(GLOBAL_STATE_KEY, existing);
    console.log(`${LOG} saved bug record: ${record.id}`);
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
    console.log(`${LOG} updated bug record: ${record.id}`);
  }

  async getAll(): Promise<BugRecord[]> {
    return this.globalState.get<BugRecord[]>(GLOBAL_STATE_KEY, []);
  }

  dispose(): void {
    // nothing to clean up
  }
}
