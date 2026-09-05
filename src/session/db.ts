import Dexie, { type Table } from 'dexie';

export interface SessionPoint {
  t: number;
  bpm: number;
  hrv: number | null;
  coherence: number | null;
}

export interface SessionRecord {
  id?: number;
  goal: string;
  startedAt: number;
  duration: number; // seconds
  avgBpm: number | null;
  avgHrv: number | null;
  peakCoherence: number | null;
  samples: number;
  rsaBaseline: number | null;
  series: SessionPoint[];
}

class CymatyxDb extends Dexie {
  sessions!: Table<SessionRecord, number>;
  constructor() {
    super('cymatyx-v2');
    this.version(1).stores({ sessions: '++id, startedAt, goal' });
  }
}

/** Local only. Nothing here ever leaves the machine. */
export const db = new CymatyxDb();
