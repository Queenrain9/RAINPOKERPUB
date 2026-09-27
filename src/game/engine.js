import { BALANCE } from "./balance.js";

export const TABLE_MODULE = Object.freeze({
  width: 7,
  height: 4,
  body: Object.freeze([
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
  ]),
  dealer: Object.freeze({ x: 3, y: 1 }),
  seats: Object.freeze([
    { x: 2, y: 1 },
    { x: 4, y: 1 },
    { x: 1, y: 2 },
    { x: 5, y: 2 },
    { x: 1, y: 3 },
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 5, y: 3 },
  ]),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureEconomyShape(state) {
  state.economy ||= {};
  state.economy.cash = Number(state.economy.cash || 0);
  state.economy.lifetimeRevenue = Number(state.economy.lifetimeRevenue || 0);

  state.business ||= { status: "closed" };
  state.business.todayStats ||= { sessions: 0, revenue: 0 };
  state.business.todayStats.sessions = Number(state.business.todayStats.sessions || 0);
  state.business.todayStats.revenue = Number(state.business.todayStats.revenue || 0);
}

function makeSession(nowMs) {
  return {
    status: "playing",
    startedAt: nowMs,
    endsAt: nowMs + BALANCE.session.durationMs,
    revenue: BALANCE.session.revenuePerGuest,
  };
}

function tableSolidCells(table) {
  const cells = [
    ...TABLE_MODULE.body,
    TABLE_MODULE.dealer,
    ...TABLE_MODULE.seats,
  ];

  return cells.map((cell) => ({
    x: table.anchorX + cell.x,
    y: table.anchorY + cell.y,
  }));
}

export function getTableGeometry(table) {
  return {
    body: TABLE_MODULE.body.map((cell) => ({
      x: table.anchorX + cell.x,
      y: table.anchorY + cell.y,
    })),
    dealer: {
      x: table.anchorX + TABLE_MODULE.dealer.x,
      y: table.anchorY + TABLE_MODULE.dealer.y,
    },
    seats: TABLE_MODULE.seats.map((cell, index) => ({
      index,
      x: table.anchorX + cell.x,
      y: table.anchorY + cell.y,
    })),
  };
}

export function canPlaceTable(state, anchorX, anchorY) {
  if (!state?.map) return false;
  if (state.tables.length >= state.map.maxTables) return false;

  const i = state.map.interior;
  const right = anchorX + TABLE_MODULE.width - 1;
  const bottom = anchorY + TABLE_MODULE.height - 1;

  if (
    anchorX < i.x ||
    anchorY < i.y ||
    right >= i.x + i.width ||
    bottom >= i.y + i.height
  ) {
    return false;
  }

  const candidate = {
    anchorX,
    anchorY,
  };
  const occupied = new Set(
    state.tables.flatMap(tableSolidCells).map((cell) => `${cell.x},${cell.y}`)
  );

  return tableSolidCells(candidate).every(
    (cell) => !occupied.has(`${cell.x},${cell.y}`)
  );
}

export function placeStarterTable(state, anchorX, anchorY) {
  if ((state?.starter?.tableCredits || 0) < 1) {
    throw new Error("NO_STARTER_TABLE_CREDIT");
  }
  if (!canPlaceTable(state, anchorX, anchorY)) {
    throw new Error("INVALID_TABLE_POSITION");
  }

  const next = clone(state);
  next.counters.table += 1;
  const id = `table-${next.counters.table}`;

  next.tables.push({
    id,
    kind: "basic_9max",
    anchorX,
    anchorY,
    dealerId: null,
    seatAssignments: Array(TABLE_MODULE.seats.length).fill(null),
  });

  next.starter.tableCredits -= 1;
  next.phase = "tutorial_recruit_dealer";
  next.tutorial.step = "open_staff";
  return next;
}

export function recruitBasicDealer(state) {
  if ((state?.starter?.basicRecruitCredits || 0) < 1) {
    throw new Error("NO_BASIC_RECRUIT_CREDIT");
  }

  const next = clone(state);
  next.counters.staff += 1;
  const id = `staff-${next.counters.staff}`;

  next.staff.push({
    id,
    role: "dealer",
    type: "normal",
    displayName: `일반 딜러 ${next.counters.staff}`,
    assignedTableId: null,
    recruitedAt: new Date().toISOString(),
  });

  next.starter.basicRecruitCredits -= 1;
  next.phase = "tutorial_assign_dealer";
  next.tutorial.step = "assign_dealer";
  return next;
}

export function assignDealerToTable(state, dealerId, tableId) {
  const next = clone(state);
  const dealer = next.staff.find((item) => item.id === dealerId);
  const table = next.tables.find((item) => item.id === tableId);

  if (!dealer || dealer.role !== "dealer") throw new Error("DEALER_NOT_FOUND");
  if (!table) throw new Error("TABLE_NOT_FOUND");

  if (dealer.assignedTableId) {
    const oldTable = next.tables.find((item) => item.id === dealer.assignedTableId);
    if (oldTable) oldTable.dealerId = null;
  }

  if (table.dealerId) {
    const oldDealer = next.staff.find((item) => item.id === table.dealerId);
    if (oldDealer) oldDealer.assignedTableId = null;
  }

  dealer.assignedTableId = table.id;
  table.dealerId = dealer.id;
  next.phase = "tutorial_ready_to_open";
  next.tutorial.step = "start_business";
  return next;
}

export function canOpenBusiness(state) {
  return state.tables.some((table) => Boolean(table.dealerId));
}

export function openBusiness(state) {
  if (!canOpenBusiness(state)) throw new Error("NO_OPERATING_TABLE");

  const next = clone(state);
  ensureEconomyShape(next);
  next.business.status = "open";
  next.phase = "open";
  next.calendar.week = 1;
  next.calendar.dayIndex = 0;
  next.calendar.dayName = "월요일";
  next.tutorial.step = "completed";
  next.tutorial.completed = true;
  return next;
}

export function getAvailableSeat(state) {
  for (const table of state.tables) {
    if (!table.dealerId) continue;
    const index = table.seatAssignments.findIndex((guestId) => !guestId);
    if (index >= 0) {
      const geometry = getTableGeometry(table);
      return {
        tableId: table.id,
        seatIndex: index,
        x: geometry.seats[index].x,
        y: geometry.seats[index].y,
      };
    }
  }
  return null;
}

export function spawnGuest(state) {
  if (state.business.status !== "open") return state;
  if (state.guests.some((guest) => guest.state === "walking" || guest.state === "leaving")) {
    return state;
  }

  const seat = getAvailableSeat(state);
  if (!seat) return state;

  const next = clone(state);
  next.counters.guest += 1;
  const guestId = `guest-${next.counters.guest}`;

  next.guests.push({
    id: guestId,
    type: "local",
    state: "walking",
    x: next.map.entrance.x,
    y: next.map.entrance.y,
    targetTableId: seat.tableId,
    targetSeatIndex: seat.seatIndex,
    targetX: seat.x,
    targetY: seat.y,
    session: null,
  });

  return next;
}

export function seatGuest(state, guestId, nowMs = Date.now()) {
  const next = clone(state);
  const guest = next.guests.find((item) => item.id === guestId);
  if (!guest || guest.state !== "walking") return next;

  const table = next.tables.find((item) => item.id === guest.targetTableId);
  if (!table) return next;
  if (table.seatAssignments[guest.targetSeatIndex]) return next;

  ensureEconomyShape(next);
  guest.state = "seated";
  guest.x = guest.targetX;
  guest.y = guest.targetY;
  guest.session = makeSession(nowMs);
  table.seatAssignments[guest.targetSeatIndex] = guest.id;
  return next;
}

export function ensureActiveGuestSessions(state, nowMs = Date.now()) {
  let changed = false;
  const next = clone(state);
  ensureEconomyShape(next);

  next.guests.forEach((guest) => {
    if (guest.state === "seated" && (!guest.session || guest.session.status !== "playing")) {
      guest.session = makeSession(nowMs);
      changed = true;
    }
  });

  const originalStats = state.business?.todayStats;
  const originalLifetime = state.economy?.lifetimeRevenue;
  if (!originalStats || originalLifetime === undefined) changed = true;

  return changed ? next : state;
}

export function completeGuestSession(state, guestId, nowMs = Date.now()) {
  const guest = state.guests.find((item) => item.id === guestId);
  if (
    !guest ||
    guest.state !== "seated" ||
    !guest.session ||
    guest.session.status !== "playing"
  ) {
    return state;
  }

  const next = clone(state);
  ensureEconomyShape(next);
  const nextGuest = next.guests.find((item) => item.id === guestId);
  const table = next.tables.find((item) => item.id === nextGuest.targetTableId);
  const revenue = Number(nextGuest.session.revenue || BALANCE.session.revenuePerGuest);

  if (
    table &&
    table.seatAssignments[nextGuest.targetSeatIndex] === nextGuest.id
  ) {
    table.seatAssignments[nextGuest.targetSeatIndex] = null;
  }

  nextGuest.session.status = "completed";
  nextGuest.session.completedAt = nowMs;
  nextGuest.state = "leaving";
  nextGuest.targetX = next.map.entrance.x;
  nextGuest.targetY = next.map.entrance.y;

  next.economy.cash += revenue;
  next.economy.lifetimeRevenue += revenue;
  next.business.todayStats.sessions += 1;
  next.business.todayStats.revenue += revenue;

  return next;
}

export function removeDepartedGuest(state, guestId) {
  const guest = state.guests.find((item) => item.id === guestId);
  if (!guest || guest.state !== "leaving") return state;

  const next = clone(state);
  next.guests = next.guests.filter((item) => item.id !== guestId);
  return next;
}

export function tableAtTile(state, x, y) {
  return state.tables.find((table) => {
    const geometry = getTableGeometry(table);
    return [
      ...geometry.body,
      geometry.dealer,
      ...geometry.seats,
    ].some((cell) => cell.x === x && cell.y === y);
  }) || null;
}

export function firstUnassignedDealer(state) {
  return state.staff.find(
    (item) => item.role === "dealer" && !item.assignedTableId
  ) || null;
}
