import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/game/balance.js";
import { createInitialPubState } from "../src/game/state.js";
import {
  assignDealerToTable,
  completeGuestSession,
  ensureActiveGuestSessions,
  openBusiness,
  placeStarterTable,
  recruitBasicDealer,
  removeDepartedGuest,
  seatGuest,
  spawnGuest,
} from "../src/game/engine.js";

function makeOpenPub() {
  let state = createInitialPubState("테스트 펍");
  state = placeStarterTable(state, 3, 4);
  state = recruitBasicDealer(state);
  state = assignDealerToTable(state, state.staff[0].id, state.tables[0].id);
  return openBusiness(state);
}

test("guest session earns revenue, frees seat, and leaves", () => {
  let state = makeOpenPub();
  state = spawnGuest(state);

  const guestId = state.guests[0].id;
  const tableId = state.guests[0].targetTableId;
  const seatIndex = state.guests[0].targetSeatIndex;

  state = seatGuest(state, guestId, 1_000);

  assert.equal(state.guests[0].state, "seated");
  assert.equal(state.guests[0].session.status, "playing");
  assert.equal(state.guests[0].session.endsAt, 1_000 + BALANCE.session.durationMs);
  assert.equal(state.tables[0].seatAssignments[seatIndex], guestId);

  state = completeGuestSession(
    state,
    guestId,
    1_000 + BALANCE.session.durationMs
  );

  assert.equal(state.economy.cash, BALANCE.session.revenuePerGuest);
  assert.equal(state.economy.lifetimeRevenue, BALANCE.session.revenuePerGuest);
  assert.equal(state.business.todayStats.sessions, 1);
  assert.equal(state.business.todayStats.revenue, BALANCE.session.revenuePerGuest);
  assert.equal(state.tables.find((table) => table.id === tableId).seatAssignments[seatIndex], null);
  assert.equal(state.guests[0].state, "leaving");

  state = removeDepartedGuest(state, guestId);
  assert.equal(state.guests.length, 0);
});

test("legacy seated guest is upgraded to an active session on reload", () => {
  let state = makeOpenPub();
  state = spawnGuest(state);
  state = seatGuest(state, state.guests[0].id, 2_000);

  delete state.guests[0].session;
  delete state.economy.lifetimeRevenue;
  delete state.business.todayStats;

  const upgraded = ensureActiveGuestSessions(state, 5_000);

  assert.notEqual(upgraded, state);
  assert.equal(upgraded.guests[0].session.status, "playing");
  assert.equal(upgraded.guests[0].session.startedAt, 5_000);
  assert.deepEqual(upgraded.business.todayStats, { sessions: 0, revenue: 0 });
  assert.equal(upgraded.economy.lifetimeRevenue, 0);
});
