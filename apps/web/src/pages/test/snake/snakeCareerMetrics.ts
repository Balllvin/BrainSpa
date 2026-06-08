/** Shared career-record formatting — same source as Tune policy performance. */

export type CareerRecord = {
  apples: number;
  moves: number;
  length: number;
};

export function mergeCareerWithLive(
  career: CareerRecord | null | undefined,
  live: CareerRecord,
): CareerRecord {
  const base = career ?? { apples: 0, moves: 0, length: 0 };
  const apples = Math.max(base.apples, live.apples);
  if (live.apples >= base.apples && live.apples > 0) {
    return { apples, moves: live.moves, length: live.length };
  }
  return { apples, moves: base.moves, length: base.length };
}

export function formatCareerRecord(record: CareerRecord): string {
  if (!record.apples && !record.moves && record.length <= 3) {
    return "none yet";
  }
  return `${record.apples} apples · ${record.moves} moves · length ${record.length}`;
}

export function careerFromPerformance(perf: {
  records?: { apples: number; moves: number; length: number };
} | null): CareerRecord | null {
  if (!perf?.records) {
    return null;
  }
  return {
    apples: perf.records.apples,
    moves: perf.records.moves,
    length: perf.records.length,
  };
}

export function careerFromLabFrame(lab: {
  record_apples?: number;
  record_moves?: number;
  record_length?: number;
  live_best_apples?: number;
  live_best_moves?: number;
  live_best_length?: number;
} | null): CareerRecord {
  return mergeCareerWithLive(
    lab
      ? {
          apples: lab.record_apples ?? 0,
          moves: lab.record_moves ?? 0,
          length: lab.record_length ?? 0,
        }
      : null,
    {
      apples: lab?.live_best_apples ?? 0,
      moves: lab?.live_best_moves ?? 0,
      length: lab?.live_best_length ?? 0,
    },
  );
}
