import { ITEMS, ITEM_BY_ID, MAX_DEPTH, MONSTERS, MONSTER_BY_ID, STARTING_WEAPON, type ItemDef } from './data';
import { computeFov } from './fov';
import { Tile, center, generateLevel } from './mapgen';
import { Rng } from './rng';

export interface Monster {
  uid: number;
  type: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  awake: boolean;
  target?: { x: number; y: number };
  skip?: boolean;
}

export interface FloorItem {
  x: number;
  y: number;
  id: string;
  amount?: number;
}

export interface InvSlot {
  id: string;
  count: number;
}

export interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  level: number;
  xp: number;
  weapon: string;
  armor: string | null;
  gold: number;
  inv: InvSlot[];
  kills: number;
}

export type MsgKind = 'info' | 'good' | 'bad' | 'loot';

export interface Message {
  text: string;
  kind: MsgKind;
}

export interface SaveState {
  version: 1;
  rng: number;
  depth: number;
  turn: number;
  w: number;
  h: number;
  tiles: number[];
  seen: string; // "0"/"1" per tile, compact for localStorage
  monsters: Monster[];
  items: FloorItem[];
  player: Player;
  messages: Message[];
  over: null | 'dead' | 'won';
  killedBy?: string;
  nextUid: number;
}

export interface Fx {
  x: number;
  y: number;
  text: string;
  color: string;
}

export const FOV_RADIUS = 8;
export const MAX_INV = 8;
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

export class Game {
  s: SaveState;
  rng: Rng;
  seen: Uint8Array;
  visible: Uint8Array;
  wall: Uint8Array;
  /** Rendering hooks: floating numbers etc. */
  onFx: (fx: Fx) => void = () => {};

  private constructor(s: SaveState) {
    this.s = s;
    this.rng = new Rng(s.rng);
    this.seen = Uint8Array.from(s.seen, (c) => (c === '1' ? 1 : 0));
    this.visible = new Uint8Array(s.w * s.h);
    this.wall = new Uint8Array(s.w * s.h);
    this.computeWalls();
    this.updateFov();
  }

  static newGame(seed = (Math.random() * 2 ** 31) | 0): Game {
    const player: Player = {
      x: 0, y: 0, hp: 20, maxHp: 20, atk: 2, def: 0, level: 1, xp: 0,
      weapon: STARTING_WEAPON.id, armor: null, gold: 0, inv: [{ id: 'heal', count: 1 }], kills: 0,
    };
    const s: SaveState = {
      version: 1, rng: seed, depth: 0, turn: 0, w: 1, h: 1, tiles: [0], seen: '0',
      monsters: [], items: [], player, messages: [], over: null, nextUid: 1,
    };
    const g = new Game(s);
    g.enterLevel(1);
    g.log('You enter the dungeon. Somewhere below lies the Starlit Crown.', 'info');
    return g;
  }

  static load(json: string): Game | null {
    try {
      const s = JSON.parse(json) as SaveState;
      if (s.version !== 1 || !s.player || !Array.isArray(s.tiles)) return null;
      return new Game(s);
    } catch {
      return null;
    }
  }

  serialize(): string {
    this.s.rng = this.rng.state;
    this.s.seen = Array.from(this.seen, (v) => (v ? '1' : '0')).join('');
    return JSON.stringify(this.s);
  }

  // ---------- helpers ----------

  get p(): Player {
    return this.s.player;
  }

  idx(x: number, y: number): number {
    return y * this.s.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.s.w && y < this.s.h;
  }

  tile(x: number, y: number): number {
    return this.inBounds(x, y) ? this.s.tiles[this.idx(x, y)] : Tile.Rock;
  }

  passable(x: number, y: number): boolean {
    return this.tile(x, y) !== Tile.Rock;
  }

  monsterAt(x: number, y: number): Monster | undefined {
    return this.s.monsters.find((m) => m.x === x && m.y === y);
  }

  itemsAt(x: number, y: number): FloorItem[] {
    return this.s.items.filter((i) => i.x === x && i.y === y);
  }

  attack(): number {
    return this.p.atk + (ITEM_BY_ID[this.p.weapon]?.power ?? 0);
  }

  defense(): number {
    return this.p.def + (this.p.armor ? ITEM_BY_ID[this.p.armor].power ?? 0 : 0);
  }

  xpToNext(): number {
    return this.p.level * 10;
  }

  log(text: string, kind: MsgKind = 'info') {
    this.s.messages.push({ text, kind });
    if (this.s.messages.length > 60) this.s.messages.splice(0, this.s.messages.length - 60);
  }

  visibleMonsters(): Monster[] {
    return this.s.monsters.filter((m) => this.visible[this.idx(m.x, m.y)]);
  }

  onStairs(): boolean {
    return this.tile(this.p.x, this.p.y) === Tile.StairsDown;
  }

  // ---------- level setup ----------

  private enterLevel(depth: number) {
    const lvl = generateLevel(this.rng, depth);
    const s = this.s;
    s.depth = depth;
    s.w = lvl.w;
    s.h = lvl.h;
    s.tiles = lvl.tiles;
    s.monsters = [];
    s.items = [];
    this.seen = new Uint8Array(lvl.w * lvl.h);
    this.visible = new Uint8Array(lvl.w * lvl.h);
    this.wall = new Uint8Array(lvl.w * lvl.h);
    this.p.x = lvl.start.x;
    this.p.y = lvl.start.y;

    const startRoom = lvl.rooms.find((r) => {
      const c = center(r);
      return c.x === lvl.start.x && c.y === lvl.start.y;
    });
    const otherRooms = lvl.rooms.filter((r) => r !== startRoom);
    const freeSpot = (rooms = otherRooms): { x: number; y: number } | null => {
      for (let t = 0; t < 50; t++) {
        const r = this.rng.pick(rooms);
        const x = this.rng.int(r.x, r.x + r.w - 1);
        const y = this.rng.int(r.y, r.y + r.h - 1);
        if (this.tile(x, y) !== Tile.Floor || this.monsterAt(x, y) || this.itemsAt(x, y).length) continue;
        return { x, y };
      }
      return null;
    };

    if (depth === MAX_DEPTH) {
      // No stairs on the last level: the crown sits where they would be, guarded by the Warden.
      s.tiles[this.idx(lvl.goal.x, lvl.goal.y)] = Tile.Floor;
      s.items.push({ x: lvl.goal.x, y: lvl.goal.y, id: 'crown' });
      const spot = DIRS.map(([dx, dy]) => ({ x: lvl.goal.x + dx, y: lvl.goal.y + dy })).find(
        (q) => this.tile(q.x, q.y) === Tile.Floor,
      );
      if (spot) this.spawnMonster('warden', spot.x, spot.y);
    }

    const pool = MONSTERS.filter((m) => depth >= m.minDepth && depth <= m.maxDepth);
    const count = 3 + depth * 2;
    for (let i = 0; i < count; i++) {
      const spot = freeSpot();
      if (spot) this.spawnMonster(this.rng.pick(pool).id, spot.x, spot.y);
    }
    if (depth >= 2 && this.rng.chance(0.12)) {
      const spot = freeSpot();
      if (spot) this.spawnMonster('platino', spot.x, spot.y);
    }

    const itemPool = ITEMS.filter((i) => depth >= i.minDepth && i.weight > 0);
    const totalWeight = itemPool.reduce((a, i) => a + i.weight, 0);
    const rollItem = (): ItemDef => {
      let r = this.rng.next() * totalWeight;
      for (const i of itemPool) {
        r -= i.weight;
        if (r <= 0) return i;
      }
      return itemPool[0];
    };
    const placeItem = (def: ItemDef, rooms = otherRooms) => {
      const spot = freeSpot(rooms);
      if (!spot) return;
      const item: FloorItem = { x: spot.x, y: spot.y, id: def.id };
      if (def.kind === 'gold') item.amount = this.rng.int(3, 8) * depth;
      s.items.push(item);
    };
    placeItem(ITEM_BY_ID.heal);
    if (depth === 1) placeItem(ITEM_BY_ID.sword, lvl.rooms);
    const itemCount = 4 + this.rng.int(0, 2);
    for (let i = 0; i < itemCount; i++) placeItem(rollItem(), lvl.rooms);

    this.computeWalls();
    this.updateFov();
  }

  private spawnMonster(type: string, x: number, y: number) {
    const def = MONSTER_BY_ID[type];
    this.s.monsters.push({ uid: this.s.nextUid++, type, x, y, hp: def.hp, maxHp: def.hp, awake: false });
  }

  private computeWalls() {
    const { w, h } = this.s;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let isWall = 0;
        if (this.tile(x, y) === Tile.Rock) {
          for (const [dx, dy] of DIRS) if (this.passable(x + dx, y + dy)) isWall = 1;
        }
        this.wall[this.idx(x, y)] = isWall;
      }
  }

  updateFov() {
    this.visible.fill(0);
    computeFov(
      this.s.w, this.s.h, this.p.x, this.p.y, FOV_RADIUS,
      (x, y) => !this.passable(x, y),
      (x, y) => {
        const i = this.idx(x, y);
        this.visible[i] = 1;
        this.seen[i] = 1;
      },
    );
  }

  // ---------- player actions (each returns true if a turn passed) ----------

  move(dx: number, dy: number): boolean {
    if (this.s.over) return false;
    const nx = this.p.x + dx;
    const ny = this.p.y + dy;
    const m = this.monsterAt(nx, ny);
    if (m) {
      this.playerAttack(m);
      this.endTurn();
      return true;
    }
    if (!this.passable(nx, ny)) return false;
    this.p.x = nx;
    this.p.y = ny;
    this.pickUp();
    if (this.onStairs()) this.log('Stairs lead down. Tap yourself or press > to descend.', 'info');
    this.endTurn();
    return true;
  }

  wait(): boolean {
    if (this.s.over) return false;
    this.endTurn();
    return true;
  }

  descend(): boolean {
    if (this.s.over) return false;
    if (!this.onStairs()) {
      this.log('There are no stairs here.', 'info');
      return false;
    }
    const next = this.s.depth + 1;
    this.enterLevel(next);
    this.p.hp = Math.min(this.p.maxHp, this.p.hp + Math.ceil(this.p.maxHp / 4));
    this.log(`You descend to depth ${next}.` + (next === MAX_DEPTH ? ' The crown must be near...' : ''), 'info');
    return true;
  }

  useItem(slot: number): boolean {
    if (this.s.over) return false;
    const inv = this.p.inv[slot];
    if (!inv) return false;
    const def = ITEM_BY_ID[inv.id];
    switch (def.id) {
      case 'heal': {
        const amount = Math.max(10, Math.ceil(this.p.maxHp * 0.6));
        const healed = Math.min(amount, this.p.maxHp - this.p.hp);
        this.p.hp += healed;
        this.onFx({ x: this.p.x, y: this.p.y, text: `+${healed}`, color: '#6f6' });
        this.log('You drink the healing draught. You feel much better.', 'good');
        break;
      }
      case 'vigor':
        this.p.maxHp += 5;
        this.p.hp = this.p.maxHp;
        this.log('The vigor tonic fills you with strength. Max health +5!', 'good');
        break;
      case 'might':
        this.p.atk += 1;
        this.log('Your arms bulge. Attack +1!', 'good');
        break;
      case 'map':
        for (let i = 0; i < this.seen.length; i++) if (this.s.tiles[i] !== Tile.Rock || this.wall[i]) this.seen[i] = 1;
        this.log('The scroll reveals the layout of this level.', 'good');
        break;
      case 'blink': {
        const spots: { x: number; y: number }[] = [];
        for (let y = 0; y < this.s.h; y++)
          for (let x = 0; x < this.s.w; x++) {
            if (this.tile(x, y) !== Tile.Floor || this.monsterAt(x, y)) continue;
            const near = this.s.monsters.some((m) => Math.max(Math.abs(m.x - x), Math.abs(m.y - y)) < 5);
            if (!near) spots.push({ x, y });
          }
        if (spots.length) {
          const q = this.rng.pick(spots);
          this.p.x = q.x;
          this.p.y = q.y;
        }
        this.log('Space folds around you. You are somewhere else.', 'good');
        break;
      }
      default:
        return false;
    }
    inv.count--;
    if (inv.count <= 0) this.p.inv.splice(slot, 1);
    this.endTurn();
    return true;
  }

  private pickUp() {
    for (const item of this.itemsAt(this.p.x, this.p.y)) {
      const def = ITEM_BY_ID[item.id];
      let taken = true;
      switch (def.kind) {
        case 'gold':
          this.p.gold += item.amount ?? 1;
          this.log(`You pick up ${item.amount} gold.`, 'loot');
          break;
        case 'crown':
          this.s.over = 'won';
          this.log('You lift the Starlit Crown. You win!', 'good');
          break;
        case 'weapon': {
          const cur = ITEM_BY_ID[this.p.weapon];
          if ((def.power ?? 0) > (cur.power ?? 0)) {
            this.p.weapon = def.id;
            this.log(`You wield the ${def.name} (${def.desc})`, 'loot');
          } else {
            this.log(`You see a ${def.name}, but your ${cur.name} is as good.`, 'info');
            taken = false;
          }
          break;
        }
        case 'armor': {
          const cur = this.p.armor ? ITEM_BY_ID[this.p.armor] : null;
          if (!cur || (def.power ?? 0) > (cur.power ?? 0)) {
            this.p.armor = def.id;
            this.log(`You put on the ${def.name} (${def.desc})`, 'loot');
          } else {
            this.log(`You see a ${def.name}, but your ${cur.name} is as good.`, 'info');
            taken = false;
          }
          break;
        }
        default: {
          const slot = this.p.inv.find((s) => s.id === def.id);
          if (slot) slot.count++;
          else if (this.p.inv.length < MAX_INV) this.p.inv.push({ id: def.id, count: 1 });
          else {
            this.log(`Your pack is full. You leave the ${def.name}.`, 'info');
            taken = false;
            break;
          }
          this.log(`You pick up a ${def.name}.`, 'loot');
        }
      }
      if (taken) this.s.items.splice(this.s.items.indexOf(item), 1);
    }
  }

  private playerAttack(m: Monster) {
    const def = MONSTER_BY_ID[m.type];
    if (def.friendly) {
      const gift = 30;
      this.p.gold += gift;
      this.s.monsters.splice(this.s.monsters.indexOf(m), 1);
      this.log(`${def.name} the lizard blinks at you, drops ${gift} gold, and vanishes into a crack in the wall.`, 'loot');
      return;
    }
    if (!this.rng.chance(0.9)) {
      this.log(`You miss the ${def.name}.`, 'info');
      this.onFx({ x: m.x, y: m.y, text: 'miss', color: '#ccc' });
      return;
    }
    const atk = this.attack();
    const dmg = Math.max(1, this.rng.int(Math.ceil(atk / 2), atk) - def.def);
    m.hp -= dmg;
    m.awake = true;
    this.onFx({ x: m.x, y: m.y, text: `-${dmg}`, color: '#ff5' });
    if (m.hp <= 0) {
      this.s.monsters.splice(this.s.monsters.indexOf(m), 1);
      this.p.kills++;
      this.log(`You defeat the ${def.name}!`, 'good');
      this.gainXp(def.xp);
    } else {
      this.log(`You hit the ${def.name}.`, 'info');
    }
  }

  private gainXp(xp: number) {
    this.p.xp += xp;
    while (this.p.xp >= this.xpToNext()) {
      this.p.xp -= this.xpToNext();
      this.p.level++;
      this.p.maxHp += 4;
      this.p.hp = Math.min(this.p.maxHp, this.p.hp + Math.ceil(this.p.maxHp / 2));
      if (this.p.level % 2 === 0) this.p.atk += 1;
      if (this.p.level % 3 === 0) this.p.def += 1;
      this.log(`You reach level ${this.p.level}! You feel stronger.`, 'good');
      this.onFx({ x: this.p.x, y: this.p.y, text: 'LEVEL UP', color: '#7cf' });
    }
  }

  // ---------- world turn ----------

  private endTurn() {
    if (this.s.over) {
      this.updateFov();
      return;
    }
    this.s.turn++;
    this.updateFov();
    for (const m of [...this.s.monsters]) {
      if (this.s.over) break;
      this.monsterAct(m);
    }
    if (this.s.turn % 5 === 0 && this.p.hp < this.p.maxHp && this.p.hp > 0) this.p.hp++;
    this.updateFov();
  }

  private monsterAct(m: Monster) {
    const def = MONSTER_BY_ID[m.type];
    if (def.friendly) {
      if (this.rng.chance(0.5)) this.wander(m);
      return;
    }
    if (def.slow) {
      m.skip = !m.skip;
      if (m.skip) return;
    }
    const dist = Math.max(Math.abs(m.x - this.p.x), Math.abs(m.y - this.p.y));
    const sees = this.visible[this.idx(m.x, m.y)] === 1 && dist <= FOV_RADIUS;
    if (sees) {
      if (!m.awake && def.sleepy && dist > 2 && this.rng.chance(0.75)) return;
      if (!m.awake && dist > 1) this.log(`The ${def.name} notices you!`, 'bad');
      m.awake = true;
      m.target = { x: this.p.x, y: this.p.y };
    }
    if (m.awake && m.target) {
      if (dist === 1) {
        this.monsterAttack(m);
        return;
      }
      this.stepToward(m, m.target.x, m.target.y);
      if (m.target && m.x === m.target.x && m.y === m.target.y) m.target = undefined;
      return;
    }
    if (!def.boss && this.rng.chance(0.4)) this.wander(m);
  }

  private monsterAttack(m: Monster) {
    const def = MONSTER_BY_ID[m.type];
    if (!this.rng.chance(0.75)) {
      this.log(`The ${def.name} misses you.`, 'info');
      this.onFx({ x: this.p.x, y: this.p.y, text: 'miss', color: '#ccc' });
      return;
    }
    const dmg = Math.max(1, this.rng.int(Math.ceil(def.atk / 2), def.atk) - this.defense());
    this.p.hp -= dmg;
    this.onFx({ x: this.p.x, y: this.p.y, text: `-${dmg}`, color: '#f55' });
    this.log(`The ${def.name} hits you for ${dmg}.`, 'bad');
    if (this.p.hp <= 0) {
      this.p.hp = 0;
      this.s.over = 'dead';
      this.s.killedBy = def.name;
      this.log(`You were defeated by the ${def.name}.`, 'bad');
    }
  }

  private canEnter(x: number, y: number): boolean {
    return this.passable(x, y) && !this.monsterAt(x, y) && !(x === this.p.x && y === this.p.y);
  }

  private wander(m: Monster) {
    const [dx, dy] = this.rng.pick(DIRS);
    if (this.canEnter(m.x + dx, m.y + dy)) {
      m.x += dx;
      m.y += dy;
    }
  }

  private stepToward(m: Monster, tx: number, ty: number) {
    const d = (x: number, y: number) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) + 0.01 * Math.hypot(x - tx, y - ty);
    let best: [number, number] | null = null;
    let bestD = d(m.x, m.y);
    for (const [dx, dy] of DIRS) {
      const nx = m.x + dx;
      const ny = m.y + dy;
      if (!this.canEnter(nx, ny)) continue;
      const nd = d(nx, ny);
      if (nd < bestD) {
        bestD = nd;
        best = [dx, dy];
      }
    }
    if (best) {
      m.x += best[0];
      m.y += best[1];
    } else {
      m.target = undefined; // stuck: give up the chase for now
    }
  }

  // ---------- pathing for tap-to-move and auto-explore ----------

  /** First step of the shortest known path to (tx, ty), or null. Monsters block except on the target tile. */
  stepTowards(tx: number, ty: number): [number, number] | null {
    return this.firstStep((x, y) => x === tx && y === ty);
  }

  /** Next step for auto-explore: nearest unexplored edge or unpicked item. */
  exploreStep(): [number, number] | null {
    const { w, h } = this.s;
    const wantedItem = new Set(
      this.s.items
        .filter((i) => this.seen[this.idx(i.x, i.y)] && this.wouldTake(i))
        .map((i) => this.idx(i.x, i.y)),
    );
    return this.firstStep((x, y) => {
      const i = this.idx(x, y);
      if (wantedItem.has(i)) return true;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !this.seen[this.idx(nx, ny)]) return true;
      }
      return false;
    });
  }

  private wouldTake(item: FloorItem): boolean {
    const def = ITEM_BY_ID[item.id];
    if (def.kind === 'weapon') return (def.power ?? 0) > (ITEM_BY_ID[this.p.weapon].power ?? 0);
    if (def.kind === 'armor') return (def.power ?? 0) > (this.p.armor ? ITEM_BY_ID[this.p.armor].power ?? 0 : 0);
    if (def.kind === 'potion' || def.kind === 'scroll')
      return this.p.inv.length < MAX_INV || this.p.inv.some((s) => s.id === def.id);
    return true;
  }

  private firstStep(isGoal: (x: number, y: number) => boolean): [number, number] | null {
    const { w, h } = this.s;
    const prev = new Int32Array(w * h).fill(-1);
    const start = this.idx(this.p.x, this.p.y);
    prev[start] = start;
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi];
      const x = i % w;
      const y = (i - x) / w;
      if (i !== start && isGoal(x, y)) {
        let cur = i;
        while (prev[cur] !== start) cur = prev[cur];
        const cx = cur % w;
        return [cx - this.p.x, (cur - cx) / w - this.p.y];
      }
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = this.idx(nx, ny);
        if (prev[j] !== -1 || !this.seen[j] || !this.passable(nx, ny)) continue;
        if (this.monsterAt(nx, ny) && this.visible[j] && !isGoal(nx, ny)) continue;
        prev[j] = i;
        queue.push(j);
      }
    }
    return null;
  }
}
