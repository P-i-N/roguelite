import { Rng } from './rng';

export const enum Tile {
  Rock = 0,
  Floor = 1,
  StairsDown = 2,
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeneratedLevel {
  w: number;
  h: number;
  tiles: number[];
  rooms: Room[];
  start: { x: number; y: number };
  /** Room that holds the down stairs (or the treasure on the last level). */
  goalRoom: Room;
  goal: { x: number; y: number };
}

export const center = (r: Room) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

export function generateLevel(rng: Rng, depth: number): GeneratedLevel {
  const w = 44;
  const h = 28;
  for (;;) {
    const lvl = tryGenerate(rng, w, h, depth);
    if (lvl) return lvl;
  }
}

function tryGenerate(rng: Rng, w: number, h: number, depth: number): GeneratedLevel | null {
  const tiles = new Array<number>(w * h).fill(Tile.Rock);
  const set = (x: number, y: number, t: Tile) => {
    tiles[y * w + x] = t;
  };
  const rooms: Room[] = [];
  const wanted = 6 + Math.min(depth, 3);

  for (let tries = 0; tries < 300 && rooms.length < wanted; tries++) {
    const rw = rng.int(4, 9);
    const rh = rng.int(3, 6);
    const r = { x: rng.int(1, w - rw - 2), y: rng.int(1, h - rh - 2), w: rw, h: rh };
    const overlaps = rooms.some(
      (o) => r.x - 2 < o.x + o.w && r.x + r.w + 2 > o.x && r.y - 2 < o.y + o.h && r.y + r.h + 2 > o.y,
    );
    if (overlaps) continue;
    rooms.push(r);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, Tile.Floor);
  }
  if (rooms.length < 5) return null;

  // Connect rooms in left-to-right order so corridors don't criss-cross too much, then add a few loops.
  rooms.sort((a, b) => a.x - b.x);
  const carve = (a: Room, b: Room) => {
    const p = center(a);
    const q = center(b);
    const horizontalFirst = rng.chance(0.5);
    let x = p.x;
    let y = p.y;
    const stepX = () => {
      while (x !== q.x) {
        x += Math.sign(q.x - x);
        set(x, y, Tile.Floor);
      }
    };
    const stepY = () => {
      while (y !== q.y) {
        y += Math.sign(q.y - y);
        set(x, y, Tile.Floor);
      }
    };
    if (horizontalFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }
  };
  for (let i = 1; i < rooms.length; i++) carve(rooms[i - 1], rooms[i]);
  for (let i = 0; i < 2; i++) {
    const a = rng.pick(rooms);
    const b = rng.pick(rooms);
    if (a !== b) carve(a, b);
  }

  const startRoom = rooms[0];
  const start = center(startRoom);

  // Put the goal in the room farthest (by walking distance) from the start.
  const dist = bfs(tiles, w, h, start.x, start.y);
  let goalRoom = rooms[rooms.length - 1];
  let best = -1;
  for (const r of rooms) {
    if (r === startRoom) continue;
    const c = center(r);
    const d = dist[c.y * w + c.x];
    if (d > best) {
      best = d;
      goalRoom = r;
    }
  }
  const goal = center(goalRoom);
  set(goal.x, goal.y, Tile.StairsDown);
  return { w, h, tiles, rooms, start, goalRoom, goal };
}

/** Walking distance from (sx, sy) over non-rock tiles, 8-directional. -1 = unreachable. */
export function bfs(tiles: number[], w: number, h: number, sx: number, sy: number): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [sy * w + sx];
  dist[queue[0]] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (dist[j] !== -1 || tiles[j] === Tile.Rock) continue;
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
  }
  return dist;
}
