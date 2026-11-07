// Game content: monsters, items, and the look of each dungeon level.
// Sprites point into the DawnLike sheets in public/tiles (16x16 cells, x/y in cells).

export interface Sprite {
  /** Sheet path without extension, e.g. "Characters/Rodent". */
  sheet: string;
  x: number;
  y: number;
  /** Two-frame sheets come in pairs: Name0.png and Name1.png. */
  animated?: boolean;
}

const ch = (name: string, x: number, y: number): Sprite => ({ sheet: `Characters/${name}`, x, y, animated: true });
const it = (name: string, x: number, y: number): Sprite => ({ sheet: `Items/${name}`, x, y });
const ob = (name: string, x: number, y: number): Sprite => ({ sheet: `Objects/${name}`, x, y });

export const PLAYER_SPRITE = ch('Player', 1, 3);

export interface MonsterDef {
  id: string;
  name: string;
  sprite: Sprite;
  hp: number;
  atk: number;
  def: number;
  xp: number;
  /** Depths where it can appear. */
  minDepth: number;
  maxDepth: number;
  /** Slow monsters act every other turn. */
  slow?: boolean;
  /** Wanders without noticing you until close. */
  sleepy?: boolean;
  friendly?: boolean;
  boss?: boolean;
}

export const MONSTERS: MonsterDef[] = [
  { id: 'rat', name: 'cave rat', sprite: ch('Rodent', 0, 1), hp: 4, atk: 2, def: 0, xp: 2, minDepth: 1, maxDepth: 3 },
  { id: 'slime', name: 'moss slime', sprite: ch('Slime', 3, 0), hp: 7, atk: 2, def: 0, xp: 3, minDepth: 1, maxDepth: 3, slow: true },
  { id: 'spider', name: 'web spinner', sprite: ch('Pest', 0, 4), hp: 6, atk: 3, def: 0, xp: 4, minDepth: 2, maxDepth: 4 },
  { id: 'lizard', name: 'mire lizard', sprite: ch('Reptile', 0, 8), hp: 9, atk: 3, def: 1, xp: 5, minDepth: 2, maxDepth: 5, sleepy: true },
  { id: 'bones', name: 'rattlebones', sprite: ch('Undead', 4, 1), hp: 12, atk: 5, def: 1, xp: 7, minDepth: 3, maxDepth: 5 },
  { id: 'wisp', name: 'pale wisp', sprite: ch('Undead', 0, 4), hp: 9, atk: 6, def: 0, xp: 7, minDepth: 3, maxDepth: 5 },
  { id: 'imp', name: 'ember imp', sprite: ch('Demon', 2, 4), hp: 16, atk: 6, def: 2, xp: 10, minDepth: 4, maxDepth: 5 },
  {
    id: 'warden', name: 'Crown Warden', sprite: ch('Demon', 0, 1), hp: 45, atk: 8, def: 3, xp: 30,
    minDepth: 99, maxDepth: 99, boss: true,
  },
  // A very shy lizard. DawnLike's artist asked for his sprite to be hidden somewhere in every game that uses it.
  { id: 'platino', name: 'Platino', sprite: ch('Reptile', 3, 12), hp: 99, atk: 0, def: 0, xp: 0, minDepth: 99, maxDepth: 99, friendly: true },
];

export const MONSTER_BY_ID: Record<string, MonsterDef> = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));

export type ItemKind = 'potion' | 'scroll' | 'weapon' | 'armor' | 'gold' | 'crown';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  sprite: Sprite;
  desc: string;
  /** Attack bonus for weapons, defense for armor. */
  power?: number;
  minDepth: number;
  weight: number;
}

export const ITEMS: ItemDef[] = [
  { id: 'heal', name: 'healing draught', kind: 'potion', sprite: it('Potion', 0, 0), desc: 'Restores most of your health.', minDepth: 1, weight: 10 },
  { id: 'vigor', name: 'vigor tonic', kind: 'potion', sprite: it('Potion', 0, 1), desc: 'Raises max health by 5 and heals you fully.', minDepth: 2, weight: 3 },
  { id: 'might', name: 'brawn brew', kind: 'potion', sprite: it('Potion', 4, 0), desc: 'Permanently raises attack by 1.', minDepth: 2, weight: 3 },
  { id: 'map', name: 'scroll of seeing', kind: 'scroll', sprite: it('Scroll', 0, 0), desc: 'Reveals the whole level map.', minDepth: 1, weight: 4 },
  { id: 'blink', name: 'scroll of blinking', kind: 'scroll', sprite: it('Scroll', 2, 0), desc: 'Teleports you to a random safe spot.', minDepth: 1, weight: 4 },
  { id: 'sword', name: 'short sword', kind: 'weapon', sprite: it('ShortWep', 7, 0), desc: 'Attack +2.', power: 2, minDepth: 1, weight: 3 },
  { id: 'blade', name: 'broad blade', kind: 'weapon', sprite: it('ShortWep', 5, 0), desc: 'Attack +4.', power: 4, minDepth: 3, weight: 2 },
  { id: 'vest', name: 'padded vest', kind: 'armor', sprite: it('Armor', 0, 6), desc: 'Defense +1.', power: 1, minDepth: 1, weight: 3 },
  { id: 'mail', name: 'ring mail', kind: 'armor', sprite: it('Armor', 3, 6), desc: 'Defense +2.', power: 2, minDepth: 2, weight: 2 },
  { id: 'plate', name: 'plate coat', kind: 'armor', sprite: it('Armor', 5, 6), desc: 'Defense +3.', power: 3, minDepth: 4, weight: 1 },
  { id: 'gold', name: 'gold', kind: 'gold', sprite: it('Money', 1, 0), desc: 'Shiny.', minDepth: 1, weight: 8 },
  { id: 'crown', name: 'Starlit Crown', kind: 'crown', sprite: it('Money', 0, 4), desc: 'The treasure you came for.', minDepth: 99, weight: 0 },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const STARTING_WEAPON: ItemDef = {
  id: 'dagger', name: 'old dagger', kind: 'weapon', sprite: it('ShortWep', 0, 0), desc: 'Attack +1.', power: 1, minDepth: 99, weight: 0,
};
ITEM_BY_ID[STARTING_WEAPON.id] = STARTING_WEAPON;

export const STAIRS_DOWN = ob('Tile', 1, 1);

export interface Theme {
  name: string;
  /** Plain floor tile. */
  floor: Sprite;
  /** Top-left cell of a 7x3 DawnLike wall block. */
  wallX: number;
  wallY: number;
}

export const THEMES: Theme[] = [
  { name: 'Old Cellars', floor: ob('Floor', 1, 7), wallX: 0, wallY: 3 },
  { name: 'Mossy Halls', floor: ob('Floor', 8, 7), wallX: 0, wallY: 9 },
  { name: 'Sandstone Vaults', floor: ob('Floor', 8, 22), wallX: 0, wallY: 15 },
  { name: 'Ember Tunnels', floor: ob('Floor', 1, 22), wallX: 14, wallY: 15 },
  { name: 'Starlit Throne', floor: ob('Floor', 8, 25), wallX: 0, wallY: 24 },
];

export const MAX_DEPTH = 5;
