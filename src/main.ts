import { ITEM_BY_ID, MAX_DEPTH, MONSTER_BY_ID, THEMES, type Sprite } from './data';
import { Game, MAX_INV } from './game';
import { Renderer } from './render';

const SAVE_KEY = 'roguelite.save.v1';
const PREFS_KEY = 'roguelite.prefs.v1';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('view');
const renderer = new Renderer(canvas);
let game: Game;

interface Prefs {
  zoom: number;
  dpad: boolean;
  seenHelp: boolean;
}
const prefs: Prefs = { zoom: 0, dpad: false, seenHelp: false };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'));
} catch {
  /* storage unavailable: defaults are fine */
}
const savePrefs = () => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
};

// ---------- save / load ----------

function saveGame() {
  try {
    if (game.s.over) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, game.serialize());
  } catch {
    /* ignore */
  }
}

function startGame(g: Game) {
  game = g;
  game.onFx = (fx) => renderer.addFx(fx);
  renderer.snapCamera(game);
  renderer.highlight = null;
  stopAuto();
  refreshUi();
}

// ---------- auto-walk (tap-to-move and explore) ----------

type Auto = { kind: 'explore' } | { kind: 'goto'; x: number; y: number };
let auto: Auto | null = null;
let autoTimer = 0;

function stopAuto() {
  auto = null;
  clearTimeout(autoTimer);
  renderer.highlight = null;
}

function startAuto(a: Auto) {
  stopAuto();
  auto = a;
  if (a.kind === 'goto') renderer.highlight = { x: a.x, y: a.y };
  autoTick();
}

function hostileVisible(): Set<number> {
  return new Set(game.visibleMonsters().filter((m) => !MONSTER_BY_ID[m.type].friendly).map((m) => m.uid));
}

function autoTick() {
  if (!auto || game.s.over) return stopAuto();
  const before = hostileVisible();
  const hpBefore = game.p.hp;
  const depthBefore = game.s.depth;

  let step: [number, number] | null;
  if (auto.kind === 'explore') {
    step = game.exploreStep();
    if (!step) {
      if (game.onStairs()) game.log('This level is explored. Descend when ready.', 'info');
      else {
        const stairs = findStairs();
        if (stairs) {
          auto = { kind: 'goto', x: stairs.x, y: stairs.y };
          renderer.highlight = stairs;
          game.log('Nothing left to explore. Heading to the stairs.', 'info');
          return autoTick();
        }
        game.log('Nothing left to explore here.', 'info');
      }
      stopAuto();
      refreshUi();
      return;
    }
  } else {
    if (game.p.x === auto.x && game.p.y === auto.y) {
      stopAuto();
      refreshUi();
      return;
    }
    step = game.stepTowards(auto.x, auto.y);
    if (!step) {
      stopAuto();
      refreshUi();
      return;
    }
  }

  const target = game.monsterAt(game.p.x + step[0], game.p.y + step[1]);
  game.move(step[0], step[1]);
  afterTurn();

  // Stop when something new shows up, when hurt, or after bumping into a monster.
  const after = hostileVisible();
  const newThreat = [...after].some((uid) => !before.has(uid));
  if (target || newThreat || game.p.hp < hpBefore || game.s.depth !== depthBefore) {
    stopAuto();
    refreshUi();
    return;
  }
  autoTimer = window.setTimeout(autoTick, 85);
}

function findStairs(): { x: number; y: number } | null {
  for (let y = 0; y < game.s.h; y++)
    for (let x = 0; x < game.s.w; x++) if (game.tile(x, y) === 2 && game.seen[game.idx(x, y)]) return { x, y };
  return null;
}

// ---------- actions ----------

function afterTurn() {
  saveGame();
  refreshUi();
}

function act(fn: () => boolean) {
  stopAuto();
  if (game.s.over) return;
  if (fn()) afterTurn();
  else refreshUi();
}

function descend() {
  act(() => {
    const ok = game.descend();
    if (ok) renderer.snapCamera(game);
    return ok;
  });
}

function nearestHostile() {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const m of game.visibleMonsters()) {
    if (MONSTER_BY_ID[m.type].friendly) continue;
    const d = Math.max(Math.abs(m.x - game.p.x), Math.abs(m.y - game.p.y));
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** One-button play: explore when it's quiet, step toward / attack the nearest enemy when it isn't. */
function explore() {
  if (game.s.over) return;
  const foe = nearestHostile();
  if (foe) {
    act(() => {
      const step = game.stepTowards(foe.x, foe.y);
      if (step) return game.move(step[0], step[1]);
      return game.move(Math.sign(foe.x - game.p.x), Math.sign(foe.y - game.p.y));
    });
    return;
  }
  startAuto({ kind: 'explore' });
}

function onTapCell(x: number, y: number) {
  if (game.s.over) return;
  const dx = x - game.p.x;
  const dy = y - game.p.y;
  if (dx === 0 && dy === 0) {
    if (game.onStairs()) descend();
    else act(() => game.wait());
    return;
  }
  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
    act(() => game.move(dx, dy));
    return;
  }
  if (!game.inBounds(x, y) || !game.seen[game.idx(x, y)] || !game.passable(x, y)) {
    // Tapped somewhere unknown: take one step in that general direction.
    act(() => game.move(Math.sign(dx), Math.sign(dy)));
    return;
  }
  startAuto({ kind: 'goto', x, y });
}

// ---------- input: pointer ----------

let down: { x: number; y: number; id: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || down.id !== e.pointerId) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 20) return;
  if (auto) {
    stopAuto();
    refreshUi();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const cell = renderer.screenToCell(e.clientX - rect.left, e.clientY - rect.top);
  onTapCell(cell.x, cell.y);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// On-screen pad with hold-to-repeat.
let repeatTimer = 0;
document.querySelectorAll<HTMLButtonElement>('#dpad button').forEach((btn) => {
  const fire = () => {
    if (btn.dataset.act === 'wait') {
      if (game.onStairs()) descend();
      else act(() => game.wait());
    } else {
      const [dx, dy] = btn.dataset.dir!.split(',').map(Number);
      act(() => game.move(dx, dy));
    }
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fire();
    clearInterval(repeatTimer);
    repeatTimer = window.setTimeout(function rep() {
      fire();
      repeatTimer = window.setTimeout(rep, 130);
    }, 350);
  });
  const end = () => clearTimeout(repeatTimer);
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointerleave', end);
  btn.addEventListener('pointercancel', end);
});

$('btn-explore').addEventListener('click', explore);
$('btn-wait').addEventListener('click', () => act(() => game.wait()));
$('btn-stairs').addEventListener('click', descend);
$('btn-dpad').addEventListener('click', () => {
  prefs.dpad = !prefs.dpad;
  savePrefs();
  refreshUi();
});
$('btn-help').addEventListener('click', () => showHelp());
$('zoom-in').addEventListener('click', () => setZoom(1));
$('zoom-out').addEventListener('click', () => setZoom(-1));

function setZoom(delta: number) {
  const before = renderer.scale;
  renderer.zoom += delta;
  renderer.resize();
  if (renderer.scale === before && delta < 0) renderer.zoom -= delta; // already at minimum
  if (renderer.scale > 12) {
    renderer.zoom -= delta;
    renderer.resize();
  }
  prefs.zoom = renderer.zoom;
  savePrefs();
}

// ---------- input: keyboard ----------

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
  Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1],
};
const NUMPAD: Record<string, [number, number]> = {
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
};

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('overlay').hidden) {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      (document.querySelector('#overlay .primary') as HTMLButtonElement | null)?.click();
    }
    return;
  }
  if (e.code === 'Numpad5') {
    e.preventDefault();
    act(() => game.wait());
    return;
  }
  const dir = NUMPAD[e.code] ?? KEY_DIRS[e.key] ?? KEY_DIRS[e.key.toLowerCase()];
  if (dir) {
    e.preventDefault();
    act(() => game.move(dir[0], dir[1]));
    return;
  }
  switch (e.key) {
    case '.':
    case ' ':
      e.preventDefault();
      act(() => game.wait());
      break;
    case '>':
    case 'Enter':
      e.preventDefault();
      descend();
      break;
    case 'x':
    case 'X':
      explore();
      break;
    case '?':
      showHelp();
      break;
    case '+':
    case '=':
      setZoom(1);
      break;
    case '-':
      setZoom(-1);
      break;
    default:
      if (/^[1-8]$/.test(e.key) && !e.code.startsWith('Numpad')) {
        const slot = Number(e.key) - 1;
        if (slot < MAX_INV) act(() => game.useItem(slot));
      }
  }
});

// ---------- UI ----------

function iconCanvas(sprite: Sprite, px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  renderer.drawSprite(ctx, sprite, 0, 0, px);
  return c;
}

let lastInvKey = '';
let lastLogKey = '';

function refreshUi() {
  const p = game.p;
  $('hp-fill').style.width = `${(100 * p.hp) / p.maxHp}%`;
  $('hp-text').textContent = `HP ${p.hp} / ${p.maxHp}`;
  $('depth').innerHTML = `Depth <b>${game.s.depth}</b>/${MAX_DEPTH}`;
  $('level').innerHTML = `Lv <b>${p.level}</b> <small>(${p.xp}/${game.xpToNext()} xp)</small>`;
  const atkdef = $('atkdef');
  atkdef.innerHTML = '';
  const weapon = ITEM_BY_ID[p.weapon];
  const armor = p.armor ? ITEM_BY_ID[p.armor] : null;
  const w = document.createElement('span');
  w.className = 'equip';
  w.title = `${weapon.name}: ${weapon.desc}`;
  w.append(iconCanvas(weapon.sprite, 16));
  w.insertAdjacentHTML('beforeend', ` Atk <b>${game.attack()}</b>`);
  const a = document.createElement('span');
  a.className = 'equip';
  a.title = armor ? `${armor.name}: ${armor.desc}` : 'No armor yet';
  if (armor) a.append(iconCanvas(armor.sprite, 16));
  a.insertAdjacentHTML('beforeend', ` Def <b>${game.defense()}</b>`);
  atkdef.append(w, a);
  $('gold').innerHTML = `Gold <b>${p.gold}</b>`;

  // Inventory
  const invKey = JSON.stringify(p.inv);
  if (invKey !== lastInvKey) {
    lastInvKey = invKey;
    const inv = $('inv');
    inv.innerHTML = '';
    if (!p.inv.length) {
      const e = document.createElement('span');
      e.className = 'empty';
      e.textContent = 'Your pack is empty.';
      inv.append(e);
    }
    p.inv.forEach((slot, i) => {
      const def = ITEM_BY_ID[slot.id];
      const b = document.createElement('button');
      b.className = 'slot';
      b.title = `${i + 1}: ${def.name}. ${def.desc}`;
      b.setAttribute('aria-label', `Use ${def.name}`);
      b.append(iconCanvas(def.sprite, 32));
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);
      b.append(key);
      if (slot.count > 1) {
        const c = document.createElement('span');
        c.className = 'count';
        c.textContent = `×${slot.count}`;
        b.append(c);
      }
      b.addEventListener('click', () => {
        act(() => game.useItem(i));
      });
      inv.append(b);
    });
  }

  // Message log: the last few lines, older ones faded.
  const msgs = game.s.messages.slice(-4);
  const logKey = `${game.s.messages.length}:${msgs.map((m) => m.text).join('|')}`;
  if (logKey !== lastLogKey) {
    lastLogKey = logKey;
    const log = $('log');
    log.innerHTML = '';
    msgs.forEach((m, i) => {
      const d = document.createElement('div');
      d.textContent = m.text;
      d.className = m.kind + (i < msgs.length - 2 ? ' old' : '');
      log.append(d);
    });
  }

  const foe = nearestHostile();
  $('btn-explore').textContent = foe ? 'Fight' : 'Explore';
  $('btn-explore').classList.toggle('danger', !!foe);
  $('btn-stairs').classList.toggle('ready', game.onStairs());
  ($('btn-stairs') as HTMLButtonElement).disabled = !game.onStairs();
  $('btn-dpad').classList.toggle('ready', prefs.dpad);
  $('dpad').hidden = !prefs.dpad;

  if (game.s.over && $('overlay').hidden) showEnd();
}

function showOverlay(html: string, buttons: { label: string; primary?: boolean; onClick: () => void }[]) {
  const card = $('overlay-card');
  card.innerHTML = html;
  const row = document.createElement('div');
  row.className = 'row';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.primary) el.className = 'primary';
    el.addEventListener('click', () => {
      $('overlay').hidden = true;
      b.onClick();
    });
    row.append(el);
  }
  card.append(row);
  $('overlay').hidden = false;
}

function showHelp() {
  stopAuto();
  showOverlay(
    `<h1>Roguelite</h1>
    <p>Dive ${MAX_DEPTH} levels down, get past the <b>Crown Warden</b>, and grab the <b>Starlit Crown</b>.</p>
    <h2>Touch</h2>
    <ul>
      <li><b>Tap a tile</b> to walk there. Tap next to a monster to attack it.</li>
      <li><b>Tap yourself</b> to wait a turn, or to go down when standing on stairs.</li>
      <li><b>Explore</b> walks around and picks up items for you. It stops when something shows up.</li>
      <li><b>Pad</b> shows arrow buttons if you prefer them. Tap an item to use it.</li>
    </ul>
    <h2>Keyboard</h2>
    <ul>
      <li>Move or attack: arrows, WASD (Q E Z C diagonals), numpad, or HJKL YUBN.</li>
      <li>Wait: <b>.</b> or space. Descend: <b>&gt;</b> or Enter. Explore: <b>X</b>. Items: <b>1–8</b>. Zoom: <b>+ / −</b>.</li>
    </ul>
    <h2>Tips</h2>
    <ul>
      <li>You heal slowly over time, and a good chunk when you level up or go down the stairs.</li>
      <li>Better weapons and armor are equipped automatically when you walk over them.</li>
      <li>Your game is saved after every move. Close the tab any time.</li>
    </ul>
    <p class="credits">Tiles: DawnLike by DragonDePlatino, palette by DawnBringer (CC-BY-SA 3.0).</p>`,
    [
      {
        label: prefs.seenHelp ? 'Back to game' : 'Start',
        primary: true,
        onClick: () => {
          prefs.seenHelp = true;
          savePrefs();
        },
      },
      ...(prefs.seenHelp && !game.s.over
        ? [{ label: 'New game', onClick: () => confirmNewGame() }]
        : []),
    ],
  );
}

function confirmNewGame() {
  showOverlay(`<h1>Start over?</h1><p>Your current run will be lost.</p>`, [
    { label: 'Keep playing', primary: true, onClick: () => {} },
    { label: 'New game', onClick: () => newGame() },
  ]);
}

function newGame() {
  startGame(Game.newGame());
  saveGame();
}

function showEnd() {
  stopAuto();
  const p = game.p;
  const won = game.s.over === 'won';
  const theme = THEMES[(game.s.depth - 1) % THEMES.length];
  showOverlay(
    won
      ? `<h1>Victory!</h1><p>You claimed the Starlit Crown. The dungeon is yours.</p>`
      : `<h1>You fell</h1><p>Defeated by the <b>${game.s.killedBy ?? 'dark'}</b> in the ${theme.name}, depth ${game.s.depth}.</p>`,
    [{ label: 'Play again', primary: true, onClick: () => newGame() }],
  );
  const card = $('overlay-card');
  const stats = document.createElement('p');
  stats.innerHTML = `Level <b>${p.level}</b> · Monsters defeated <b>${p.kills}</b> · Gold <b>${p.gold}</b> · Turns <b>${game.s.turn}</b>`;
  card.insertBefore(stats, card.querySelector('.row'));
}

// ---------- boot ----------

function frame(now: number) {
  renderer.draw(game, now);
  requestAnimationFrame(frame);
}

async function boot() {
  await renderer.load();
  renderer.zoom = prefs.zoom;
  let loaded: Game | null = null;
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) loaded = Game.load(saved);
  } catch {
    /* ignore */
  }
  startGame(loaded ?? Game.newGame());
  if (loaded) {
    game.log('Welcome back. Your adventure continues.', 'info');
    refreshUi();
  }
  renderer.resize();
  new ResizeObserver(() => renderer.resize()).observe(canvas);
  requestAnimationFrame(frame);
  if (!prefs.seenHelp) showHelp();
  // Handy for poking at the game from the browser console.
  (window as unknown as { roguelite: unknown }).roguelite = { get game() { return game; }, refreshUi };
}

boot().catch((err) => {
  document.body.innerHTML = `<p style="padding:16px">Could not start the game: ${String(err)}</p>`;
});
