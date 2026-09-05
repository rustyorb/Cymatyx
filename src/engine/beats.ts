const MERGE_MS = 150; // two detections closer than this are the same beat (min plausible RR is 333 ms)
const KEEP_MS = 60_000; // tachogram history

export interface RrPoint {
  t: number; // ms, time of the second beat of the pair
  rr: number; // ms
}

/**
 * Continuous beat identity across overlapping analysis windows. Each frame re-detects peaks in the
 * sliding window; the tracker keeps the first sighting of every beat and ignores re-sightings, so
 * the tachogram is one interval per real beat, never one per frame.
 */
export class BeatTracker {
  private beats: number[] = []; // sorted timestamps ms

  add(times: number[]) {
    for (const t of times) {
      if (!Number.isFinite(t)) continue;
      let lo = 0;
      let hi = this.beats.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.beats[mid] < t) lo = mid + 1;
        else hi = mid;
      }
      const near = (i: number) => i >= 0 && i < this.beats.length && Math.abs(this.beats[i] - t) < MERGE_MS;
      if (near(lo) || near(lo - 1)) continue;
      this.beats.splice(lo, 0, t);
    }
    const last = this.beats[this.beats.length - 1];
    if (last !== undefined) {
      const cutoff = last - KEEP_MS;
      let drop = 0;
      while (drop < this.beats.length && this.beats[drop] < cutoff) drop++;
      if (drop) this.beats.splice(0, drop);
    }
  }

  /** Plausible successive intervals (333–1500 ms), stamped at the later beat. */
  rr(): RrPoint[] {
    const out: RrPoint[] = [];
    for (let i = 1; i < this.beats.length; i++) {
      const d = this.beats[i] - this.beats[i - 1];
      if (d >= 333 && d <= 1500) out.push({ t: this.beats[i], rr: d });
    }
    return out;
  }

  get count() {
    return this.beats.length;
  }

  reset() {
    this.beats = [];
  }
}
