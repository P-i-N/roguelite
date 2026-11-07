import { ITEMS, MONSTERS, MONSTER_BY_ID, ITEM_BY_ID, PLAYER_SPRITE, STAIRS_DOWN, THEMES, STARTING_WEAPON, type Sprite } from './data';
import type { Fx, Game } from './game';
import { Tile } from './mapgen';

const TS = 16;

interface LiveFx extends Fx {
  t0: number;
}

/** Wall autotile: neighbor mask (N=1, E=2, S=4, W=8) -> cell offset inside a DawnLike 7x3 wall block. */
const WALL_OFFSETS: Record<number, [number, number]> = {
  0: [1, 1],
  1: [0, 1], 4: [0, 1], 5: [0, 1],
  2: [1, 0], 8: [1, 0], 10: [1, 0],
  6: [0, 0],
  12: [2, 0],
  3: [0, 2],
  9: [2, 2],
  7: [3, 1],
  14: [4, 0],
  13: [5, 1],
  11: [4, 2],
  15: [4, 1],
};

export class Renderer {
  private images = new Map<string, HTMLImageElement>();
  private ctx: CanvasRenderingContext2D;
  private fx: LiveFx[] = [];
  camX = 0;
  camY = 0;
  scale = 3;
  zoom = 0;
  highlight: { x: number; y: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  async load(): Promise<void> {
    const sprites: Sprite[] = [
      PLAYER_SPRITE, STAIRS_DOWN, STARTING_WEAPON.sprite,
      ...MONSTERS.map((m) => m.sprite),
      ...ITEMS.map((i) => i.sprite),
      ...THEMES.map((t) => t.floor),
      { sheet: 'Objects/Wall', x: 0, y: 0 },
    ];
    const files = new Set<string>();
    for (const s of sprites) {
      if (s.animated) {
        files.add(`${s.sheet}0`);
        files.add(`${s.sheet}1`);
      } else files.add(s.sheet);
    }
    await Promise.all(
      [...files].map(
        (f) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`Could not load tiles/${f}.png`));
            img.src = `tiles/${f}.png`;
            this.images.set(f, img);
          }),
      ),
    );
  }

  addFx(fx: Fx) {
    this.fx.push({ ...fx, t0: performance.now() });
  }

  /** Draw a sprite into any 2D context (used for inventory icons too). */
  drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, dx: number, dy: number, size: number, frame = 0) {
    const img = this.images.get(s.animated ? `${s.sheet}${frame}` : s.sheet);
    if (!img) return;
    ctx.drawImage(img, s.x * TS, s.y * TS, TS, TS, dx, dy, size, size);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    // Aim for roughly 14 tiles across the short side, then apply the player's zoom preference.
    const base = Math.max(1, Math.floor(Math.min(this.canvas.width, this.canvas.height) / (TS * 14)));
    this.scale = Math.max(1, base + this.zoom);
  }

  /** Convert a CSS-pixel point inside the canvas to a map cell. */
  screenToCell(cssX: number, cssY: number): { x: number; y: number } {
    const dpr = this.canvas.width / this.canvas.getBoundingClientRect().width;
    const size = TS * this.scale;
    const ox = this.canvas.width / 2 - (this.camX + 0.5) * size;
    const oy = this.canvas.height / 2 - (this.camY + 0.5) * size;
    return { x: Math.floor((cssX * dpr - ox) / size), y: Math.floor((cssY * dpr - oy) / size) };
  }

  snapCamera(g: Game) {
    this.camX = g.p.x;
    this.camY = g.p.y;
  }

  draw(g: Game, now: number) {
    const ctx = this.ctx;
    const { width: cw, height: ch } = this.canvas;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0a10';
    ctx.fillRect(0, 0, cw, ch);

    this.camX += (g.p.x - this.camX) * 0.3;
    this.camY += (g.p.y - this.camY) * 0.3;
    if (Math.abs(g.p.x - this.camX) < 0.01) this.camX = g.p.x;
    if (Math.abs(g.p.y - this.camY) < 0.01) this.camY = g.p.y;

    const size = TS * this.scale;
    const ox = Math.round(cw / 2 - (this.camX + 0.5) * size);
    const oy = Math.round(ch / 2 - (this.camY + 0.5) * size);
    const x0 = Math.max(0, Math.floor(-ox / size));
    const y0 = Math.max(0, Math.floor(-oy / size));
    const x1 = Math.min(g.s.w - 1, Math.ceil((cw - ox) / size));
    const y1 = Math.min(g.s.h - 1, Math.ceil((ch - oy) / size));
    const frame = Math.floor(now / 500) % 2;
    const theme = THEMES[(g.s.depth - 1) % THEMES.length];

    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = g.idx(x, y);
        if (!g.seen[i]) continue;
        const px = ox + x * size;
        const py = oy + y * size;
        const t = g.s.tiles[i];
        if (t === Tile.Rock) {
          if (!g.wall[i]) continue;
          let mask = 0;
          if (y > 0 && g.wall[i - g.s.w]) mask |= 1;
          if (x < g.s.w - 1 && g.wall[i + 1]) mask |= 2;
          if (y < g.s.h - 1 && g.wall[i + g.s.w]) mask |= 4;
          if (x > 0 && g.wall[i - 1]) mask |= 8;
          const [wx, wy] = WALL_OFFSETS[mask];
          this.drawSprite(ctx, { sheet: 'Objects/Wall', x: theme.wallX + wx, y: theme.wallY + wy }, px, py, size);
        } else {
          this.drawSprite(ctx, theme.floor, px, py, size);
          if (t === Tile.StairsDown) this.drawSprite(ctx, STAIRS_DOWN, px, py, size);
        }
      }

    for (const item of g.s.items) {
      if (!g.seen[g.idx(item.x, item.y)]) continue;
      this.drawSprite(ctx, ITEM_BY_ID[item.id].sprite, ox + item.x * size, oy + item.y * size, size);
    }

    // Fog over remembered-but-not-visible cells.
    ctx.fillStyle = 'rgba(8, 6, 16, 0.6)';
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = g.idx(x, y);
        if (g.seen[i] && !g.visible[i]) ctx.fillRect(ox + x * size, oy + y * size, size, size);
      }

    if (this.highlight) {
      ctx.strokeStyle = 'rgba(255, 230, 120, 0.8)';
      ctx.lineWidth = Math.max(1, this.scale / 2);
      ctx.strokeRect(ox + this.highlight.x * size + 1, oy + this.highlight.y * size + 1, size - 2, size - 2);
    }

    for (const m of g.s.monsters) {
      if (!g.visible[g.idx(m.x, m.y)]) continue;
      const def = MONSTER_BY_ID[m.type];
      const px = ox + m.x * size;
      const py = oy + m.y * size;
      this.drawSprite(ctx, def.sprite, px, py, size, frame);
      if (m.hp < m.maxHp) {
        const bh = Math.max(2, this.scale);
        ctx.fillStyle = '#300';
        ctx.fillRect(px + 2, py - bh, size - 4, bh);
        ctx.fillStyle = '#e44';
        ctx.fillRect(px + 2, py - bh, ((size - 4) * m.hp) / m.maxHp, bh);
      }
    }

    if (g.s.over !== 'dead') this.drawSprite(ctx, PLAYER_SPRITE, ox + g.p.x * size, oy + g.p.y * size, size, frame);

    // Floating numbers.
    const fontPx = Math.max(10, Math.round(size * 0.42));
    ctx.font = `bold ${fontPx}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(2, fontPx / 5);
    ctx.strokeStyle = '#000';
    this.fx = this.fx.filter((f) => now - f.t0 < 800);
    for (const f of this.fx) {
      const k = (now - f.t0) / 800;
      const px = ox + (f.x + 0.5) * size;
      const py = oy + (f.y + 0.2 - k * 0.7) * size;
      ctx.globalAlpha = 1 - k * k;
      ctx.strokeText(f.text, px, py);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, px, py);
    }
    ctx.globalAlpha = 1;
  }
}
