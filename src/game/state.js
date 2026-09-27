export const MAP_SPEC = Object.freeze({
  width: 15,
  height: 18,
  interior: Object.freeze({ x: 1, y: 1, width: 13, height: 16 }),
  entrance: Object.freeze({ x: 7, y: 16 }),
  maxTables: 4,
});

export function createInitialPubState(pubName) {
  const name = String(pubName || "").trim();

  if (name.length < 2 || name.length > 20) {
    throw new Error("INVALID_PUB_NAME");
  }

  return {
    version: 1,
    phase: "tutorial_place_table",
    pub: {
      name,
      createdAt: new Date().toISOString(),
    },
    economy: {
      cash: 0,
    },
    calendar: {
      week: 1,
      dayIndex: 0,
      dayName: "월요일",
    },
    business: {
      status: "closed",
    },
    map: {
      width: MAP_SPEC.width,
      height: MAP_SPEC.height,
      interior: { ...MAP_SPEC.interior },
      entrance: { ...MAP_SPEC.entrance },
      maxTables: MAP_SPEC.maxTables,
    },
    starter: {
      tableCredits: 1,
      basicRecruitCredits: 1,
    },
    tables: [],
    staff: [],
    guests: [],
    counters: {
      table: 0,
      staff: 0,
      guest: 0,
    },
    tutorial: {
      step: "open_build",
      completed: false,
    },
  };
}
