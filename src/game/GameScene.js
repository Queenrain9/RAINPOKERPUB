import { BALANCE } from "./balance.js";
import {
  completeGuestSession,
  ensureActiveGuestSessions,
  getTableGeometry,
  removeDepartedGuest,
  seatGuest,
  spawnGuest,
} from "./engine.js";

export class GameScene extends Phaser.Scene {
  constructor(initialState, callbacks = {}) {
    super("PubScene");
    this.state = JSON.parse(JSON.stringify(initialState));
    this.callbacks = callbacks;
    this.placementMode = null;
    this.mapMetrics = null;
    this.guestSprites = new Map();
    this.sessionTimers = new Map();
    this.activeMover = null;
    this.guestTimer = null;
  }

  create() {
    this.cameras.main.setBackgroundColor("#15110d");
    this.input.on("pointerdown", (pointer) => this.handlePointer(pointer));
    this.scale.on("resize", () => this.renderAll());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupRuntime());

    const normalized = ensureActiveGuestSessions(this.state);
    if (normalized !== this.state) {
      this.state = normalized;
      this.callbacks.onStateChange?.(this.getState(), "runtime_normalized");
    }

    this.renderAll();
    this.syncSessionTimers();
    this.resumeGuestMovement();

    if (this.state.business.status === "open") {
      this.startGuestLoop();
    }
  }

  cleanupRuntime() {
    this.clearSessionTimers();
    if (this.guestTimer) {
      this.guestTimer.remove(false);
      this.guestTimer = null;
    }
    this.activeMover = null;
  }

  setState(nextState) {
    const wasOpen = this.state.business.status === "open";

    this.tweens.killAll();
    this.activeMover = null;
    this.clearSessionTimers();

    this.state = JSON.parse(JSON.stringify(nextState));
    this.state = ensureActiveGuestSessions(this.state);

    this.renderAll();
    this.syncSessionTimers();
    this.resumeGuestMovement();

    if (!wasOpen && this.state.business.status === "open") {
      this.startGuestLoop();
    }
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  setPlacementMode(mode) {
    this.placementMode = mode;
    this.renderAll();
  }

  startGuestLoop() {
    if (this.guestTimer) return;

    this.time.delayedCall(BALANCE.guestArrival.firstDelayMs, () => this.trySpawnGuest());
    this.guestTimer = this.time.addEvent({
      delay: BALANCE.guestArrival.repeatDelayMs,
      loop: true,
      callback: () => this.trySpawnGuest(),
    });
  }

  trySpawnGuest() {
    const next = spawnGuest(this.state);
    if (next === this.state || next.guests.length === this.state.guests.length) return;

    this.state = next;
    this.renderAll();
    this.callbacks.onStateChange?.(this.getState(), "guest_spawned");
    this.resumeGuestMovement();
  }

  clearSessionTimers() {
    this.sessionTimers.forEach((timer) => timer.remove(false));
    this.sessionTimers.clear();
  }

  syncSessionTimers() {
    const activeIds = new Set(
      this.state.guests
        .filter(
          (guest) =>
            guest.state === "seated" &&
            guest.session?.status === "playing"
        )
        .map((guest) => guest.id)
    );

    this.sessionTimers.forEach((timer, guestId) => {
      if (!activeIds.has(guestId)) {
        timer.remove(false);
        this.sessionTimers.delete(guestId);
      }
    });

    this.state.guests.forEach((guest) => {
      if (
        guest.state !== "seated" ||
        guest.session?.status !== "playing" ||
        this.sessionTimers.has(guest.id)
      ) {
        return;
      }

      const remaining = Math.max(1, Number(guest.session.endsAt || 0) - Date.now());
      const timer = this.time.delayedCall(remaining, () => {
        this.sessionTimers.delete(guest.id);
        this.finishGuestSession(guest.id);
      });

      this.sessionTimers.set(guest.id, timer);
    });
  }

  finishGuestSession(guestId) {
    const before = this.state.guests.find((item) => item.id === guestId);
    if (!before?.session) return;

    const revenue = Number(before.session.revenue || 0);
    const next = completeGuestSession(this.state, guestId, Date.now());
    if (next === this.state) return;

    const moverWasActive = Boolean(this.activeMover);
    this.state = next;

    if (!moverWasActive) {
      this.renderAll();
    }

    this.callbacks.onStateChange?.(
      this.getState(),
      "guest_session_completed",
      { guestId, revenue }
    );

    this.syncSessionTimers();

    if (!moverWasActive) {
      this.resumeGuestMovement();
    }
  }

  buildBlockedSet(exceptGuestId) {
    const blocked = new Set();

    this.state.tables.forEach((table) => {
      const geometry = getTableGeometry(table);
      geometry.body.forEach((cell) => blocked.add(`${cell.x},${cell.y}`));
      blocked.add(`${geometry.dealer.x},${geometry.dealer.y}`);
    });

    this.state.guests.forEach((guest) => {
      if (guest.id !== exceptGuestId && guest.state === "seated") {
        blocked.add(`${guest.x},${guest.y}`);
      }
    });

    return blocked;
  }

  findPath(start, target, exceptGuestId) {
    const { interior } = this.state.map;
    const minX = interior.x;
    const minY = interior.y;
    const maxX = interior.x + interior.width - 1;
    const maxY = interior.y + interior.height - 1;
    const blocked = this.buildBlockedSet(exceptGuestId);
    blocked.delete(`${target.x},${target.y}`);

    const key = (p) => `${p.x},${p.y}`;
    const queue = [start];
    const cameFrom = new Map([[key(start), null]]);
    const directions = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];

    while (queue.length) {
      const current = queue.shift();
      if (current.x === target.x && current.y === target.y) break;

      for (const direction of directions) {
        const next = {
          x: current.x + direction.x,
          y: current.y + direction.y,
        };
        const nextKey = key(next);

        if (
          next.x < minX || next.x > maxX ||
          next.y < minY || next.y > maxY ||
          blocked.has(nextKey) ||
          cameFrom.has(nextKey)
        ) {
          continue;
        }

        cameFrom.set(nextKey, current);
        queue.push(next);
      }
    }

    const targetKey = key(target);
    if (!cameFrom.has(targetKey)) return [];

    const path = [];
    let cursor = target;
    while (cursor) {
      path.push(cursor);
      cursor = cameFrom.get(key(cursor));
    }

    return path.reverse();
  }

  resumeGuestMovement() {
    if (this.activeMover) return;

    const guest =
      this.state.guests.find((item) => item.state === "leaving") ||
      this.state.guests.find((item) => item.state === "walking");

    if (!guest) return;

    if (guest.state === "leaving") {
      this.animateGuestToExit(guest.id);
    } else {
      this.animateGuestToSeat(guest.id);
    }
  }

  animateGuestPath(guestId, target, onArrive) {
    const guest = this.state.guests.find((item) => item.id === guestId);
    if (!guest) return;

    let sprite = this.guestSprites.get(guestId);
    if (!sprite) {
      this.renderAll();
      sprite = this.guestSprites.get(guestId);
    }
    if (!sprite) return;

    const path = this.findPath(
      { x: guest.x, y: guest.y },
      target,
      guest.id
    );

    if (!path.length) {
      this.time.delayedCall(250, () => this.resumeGuestMovement());
      return;
    }

    if (path.length === 1) {
      onArrive();
      return;
    }

    this.activeMover = guestId;
    let index = 1;

    const step = () => {
      if (index >= path.length) {
        this.activeMover = null;
        onArrive();
        return;
      }

      const nextTile = path[index++];
      const point = this.tileCenter(nextTile.x, nextTile.y);

      this.tweens.add({
        targets: sprite,
        x: point.x,
        y: point.y,
        duration: 170,
        ease: "Linear",
        onComplete: () => {
          const movingGuest = this.state.guests.find((item) => item.id === guestId);
          if (movingGuest) {
            movingGuest.x = nextTile.x;
            movingGuest.y = nextTile.y;
          }
          step();
        },
      });
    };

    step();
  }

  animateGuestToSeat(guestId) {
    const guest = this.state.guests.find((item) => item.id === guestId);
    if (!guest || guest.state !== "walking") return;

    this.animateGuestPath(
      guestId,
      { x: guest.targetX, y: guest.targetY },
      () => {
        this.state = seatGuest(this.state, guestId, Date.now());
        this.renderAll();
        this.callbacks.onStateChange?.(this.getState(), "guest_seated", { guestId });
        this.syncSessionTimers();
        this.resumeGuestMovement();
      }
    );
  }

  animateGuestToExit(guestId) {
    const guest = this.state.guests.find((item) => item.id === guestId);
    if (!guest || guest.state !== "leaving") return;

    this.animateGuestPath(
      guestId,
      { x: this.state.map.entrance.x, y: this.state.map.entrance.y },
      () => {
        this.state = removeDepartedGuest(this.state, guestId);
        this.renderAll();
        this.callbacks.onStateChange?.(this.getState(), "guest_departed", { guestId });
        this.resumeGuestMovement();
      }
    );
  }

  handlePointer(pointer) {
    if (!this.mapMetrics) return;

    const { originX, originY, tile } = this.mapMetrics;
    const x = Math.floor((pointer.x - originX) / tile);
    const y = Math.floor((pointer.y - originY) / tile);

    if (
      x < 0 || y < 0 ||
      x >= this.state.map.width ||
      y >= this.state.map.height
    ) {
      return;
    }

    this.callbacks.onTileTap?.({
      x,
      y,
      placementMode: this.placementMode,
    });
  }

  tileCenter(x, y) {
    const { originX, originY, tile } = this.mapMetrics;
    return {
      x: originX + x * tile + tile / 2,
      y: originY + y * tile + tile / 2,
    };
  }

  renderAll() {
    if (!this.sys?.isActive()) return;

    this.children.removeAll(true);
    this.guestSprites.clear();

    const { width, height } = this.scale;
    const cols = this.state.map.width;
    const rows = this.state.map.height;
    const availableW = width - 20;
    const availableH = height - 20;
    const tile = Math.max(
      14,
      Math.floor(Math.min(availableW / cols, availableH / rows))
    );

    const mapW = tile * cols;
    const mapH = tile * rows;
    const originX = Math.floor((width - mapW) / 2);
    const originY = Math.floor((height - mapH) / 2);
    this.mapMetrics = { originX, originY, tile };

    const g = this.add.graphics();
    g.fillStyle(0x100d0a, 1);
    g.fillRect(0, 0, width, height);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const isWall = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
        const isDoor = y === rows - 1 && x === this.state.map.entrance.x;

        if (isDoor) g.fillStyle(0x8c613b, 1);
        else if (isWall) g.fillStyle(0x4a3427, 1);
        else g.fillStyle((x + y) % 2 ? 0x2d251f : 0x312821, 1);

        g.fillRect(
          originX + x * tile,
          originY + y * tile,
          tile - 1,
          tile - 1
        );
      }
    }

    this.state.tables.forEach((table) => this.renderTable(g, table));
    this.renderGuests(g);

    if (this.placementMode === "table") {
      this.add.text(width / 2, originY + 8, "놓을 위치의 중심을 탭하세요", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        color: "#f2d59a",
        backgroundColor: "rgba(21,17,13,.82)",
        padding: { x: 9, y: 6 },
      }).setOrigin(.5, 0);
    }
  }

  renderTable(g, table) {
    const { tile, originX, originY } = this.mapMetrics;
    const geometry = getTableGeometry(table);

    geometry.body.forEach((cell, index) => {
      g.fillStyle(0x165b4a, 1);
      const px = originX + cell.x * tile;
      const py = originY + cell.y * tile;
      g.fillRect(px + 1, py + tile * .17, tile - 2, tile * .66);

      if (index === 0) {
        g.lineStyle(2, 0xb78346, 1);
      }
    });

    geometry.seats.forEach((seat) => {
      const point = this.tileCenter(seat.x, seat.y);
      const occupied = Boolean(table.seatAssignments[seat.index]);
      g.fillStyle(occupied ? 0xd0a06c : 0x725747, 1);
      g.fillCircle(point.x, point.y, Math.max(4, tile * .22));
    });

    const dealerPoint = this.tileCenter(geometry.dealer.x, geometry.dealer.y);
    g.fillStyle(table.dealerId ? 0xe8d8c0 : 0x63564a, 1);
    g.fillCircle(dealerPoint.x, dealerPoint.y, Math.max(4, tile * .2));

    if (table.dealerId) {
      this.add.text(dealerPoint.x, dealerPoint.y, "D", {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${Math.max(8, Math.floor(tile * .34))}px`,
        color: "#2b221b",
        fontStyle: "bold",
      }).setOrigin(.5);
    }
  }

  renderGuests(g) {
    const { tile } = this.mapMetrics;

    this.state.guests.forEach((guest) => {
      const point = this.tileCenter(guest.x, guest.y);
      const fill =
        guest.state === "leaving"
          ? 0xb98b66
          : guest.session?.status === "playing"
            ? 0xe1a36c
            : 0xd89a63;

      const sprite = this.add.circle(
        point.x,
        point.y,
        Math.max(4, tile * .17),
        fill,
        1
      );

      sprite.setStrokeStyle(1, 0x4b3021, 1);
      this.guestSprites.set(guest.id, sprite);
    });
  }
}
