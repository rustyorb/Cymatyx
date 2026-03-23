/**
 * Session persistence via IndexedDB (Dexie.js)
 *
 * Stores completed session data: biometric timeseries, entrainment params,
 * goal, duration, calibration data. Enables session history + trend analysis.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { GoalType, BiometricData, EntrainmentConfig } from '../types.ts';

// ── Schema ────────────────────────────────────────────────────────────

/** A single biometric sample recorded during a session */
export interface BiometricSample {
  timestamp: number; // epoch ms
  bpm: number;
  hrv: number;
  signalQuality: number;
  rsa?: number;
}

/** Entrainment config snapshot taken at a point in time */
export interface ConfigSnapshot {
  timestamp: number;
  config: EntrainmentConfig;
}

/** A complete session record */
export interface SessionRecord {
  id?: number; // auto-incremented
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  duration: number; // seconds
  goal: GoalType;
  calibrationRsa: number;
  biometrics: BiometricSample[]; // timeseries
  configs: ConfigSnapshot[]; // entrainment changes over time
  avgBpm: number;
  avgHrv: number;
  minBpm: number;
  maxBpm: number;
  peakSignalQuality: number;
}

// ── Database ──────────────────────────────────────────────────────────

const db = new Dexie('CymatyxSessions') as Dexie & {
  sessions: EntityTable<SessionRecord, 'id'>;
};

db.version(1).stores({
  // Indexed fields: id (auto), startedAt, goal
  sessions: '++id, startedAt, goal',
});

export { db };

// ── Helpers ───────────────────────────────────────────────────────────

/** Compute summary stats from a biometric timeseries */
function computeStats(samples: BiometricSample[]) {
  if (samples.length === 0) {
    return { avgBpm: 0, avgHrv: 0, minBpm: 0, maxBpm: 0, peakSignalQuality: 0 };
  }

  const validSamples = samples.filter((s) => s.bpm > 0);
  if (validSamples.length === 0) {
    return { avgBpm: 0, avgHrv: 0, minBpm: 0, maxBpm: 0, peakSignalQuality: 0 };
  }

  const avgBpm = Math.round(
    validSamples.reduce((sum, s) => sum + s.bpm, 0) / validSamples.length,
  );
  const avgHrv = Math.round(
    validSamples.reduce((sum, s) => sum + s.hrv, 0) / validSamples.length,
  );
  const minBpm = Math.min(...validSamples.map((s) => s.bpm));
  const maxBpm = Math.max(...validSamples.map((s) => s.bpm));
  const peakSignalQuality = Math.max(...samples.map((s) => s.signalQuality));

  return { avgBpm, avgHrv, minBpm, maxBpm, peakSignalQuality };
}

/** Save a completed session to IndexedDB */
export async function saveSession(
  startedAt: number,
  endedAt: number,
  goal: GoalType,
  calibrationRsa: number,
  biometrics: BiometricSample[],
  configs: ConfigSnapshot[],
): Promise<number> {
  const stats = computeStats(biometrics);
  const duration = Math.round((endedAt - startedAt) / 1000);

  const id = await db.sessions.add({
    startedAt,
    endedAt,
    duration,
    goal,
    calibrationRsa,
    biometrics,
    configs,
    ...stats,
  });

  return id as number;
}

/** Get all sessions, newest first */
export async function getAllSessions(): Promise<SessionRecord[]> {
  return db.sessions.orderBy('startedAt').reverse().toArray();
}

/** Get a single session by ID */
export async function getSession(id: number): Promise<SessionRecord | undefined> {
  return db.sessions.get(id);
}

/** Delete a session by ID */
export async function deleteSession(id: number): Promise<void> {
  await db.sessions.delete(id);
}

/** Get total session count */
export async function getSessionCount(): Promise<number> {
  return db.sessions.count();
}

/** Get sessions for a specific goal type */
export async function getSessionsByGoal(goal: GoalType): Promise<SessionRecord[]> {
  return db.sessions.where('goal').equals(goal).reverse().sortBy('startedAt');
}

/** Export a session as a JSON blob download */
export async function exportSession(id: number): Promise<void> {
  const session = await getSession(id);
  if (!session) throw new Error(`Session #${id} not found`);

  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cymatyx-session-${id}-${new Date(session.startedAt).toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export all sessions as a single JSON blob download */
export async function exportAllSessions(): Promise<void> {
  const sessions = await getAllSessions();
  const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cymatyx-sessions-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
