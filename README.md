# Roguelite

A simple, casual roguelike in the spirit of NetHack: turn-based dungeon crawling on a grid, procedurally generated levels, and permadeath, but quick to pick up and light to play. It runs in the browser on phones, tablets, and PCs.

This is an original game. It takes inspiration from the genre, not content from any existing game.

## The game

Dive five levels down, get past the Crown Warden, and pick up the Starlit Crown to win. A run takes about 15 to 30 minutes.

- Five small levels, each with its own look: Old Cellars, Mossy Halls, Sandstone Vaults, Ember Tunnels, and the Starlit Throne.
- Seven kinds of monsters plus a boss. Some are slow, some sleepy, all of them bump-to-fight.
- Potions (healing, vigor, brawn) and scrolls (seeing, blinking) you can carry and use any time.
- Weapons and armor equip themselves when you walk over something better.
- You heal over time, and more when you level up or take the stairs. The game saves after every move, so you can close the tab and come back.

## How to play

**Touch:** tap a tile to walk there, tap next to a monster to attack it, and tap yourself to wait (or to go down when you stand on stairs). The **Explore** button walks around and picks things up for you; when a monster is in sight it turns into **Fight** and steps toward the nearest one. **Pad** shows an on-screen d-pad if you prefer buttons. Tap an item in the bottom bar to use it. Use **+** and **−** to zoom.

**Keyboard:** arrows, WASD (Q E Z C for diagonals), the numpad, or HJKL/YUBN to move and attack. `.` or space waits, `>` or Enter goes down stairs, `X` explores or fights, `1`–`8` use items, `+`/`−` zoom, `?` shows help.

## Running it

You need Node.js 18 or newer.

```sh
npm install
npm run dev       # dev server; open the printed URL (it is also reachable from your phone on the same Wi-Fi)
npm run build     # static site in dist/
npm run preview   # serve the built site
```

The build uses relative paths, so `dist/` can be hosted from any folder or sub-path.

### GitHub Pages

`.github/workflows/deploy.yml` builds the game and publishes it to GitHub Pages on every push to `main`. To turn it on, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**. The game will then be at `https://<user>.github.io/<repo>/`. GitHub Pages for a private repository needs a paid GitHub plan; on a free plan, make the repository public or host `dist/` elsewhere (Netlify, Cloudflare Pages, itch.io).

## Code layout

| File | What it does |
| --- | --- |
| `src/data.ts` | Monsters, items, level themes, and which tile each one uses |
| `src/mapgen.ts` | Room-and-corridor level generator |
| `src/fov.ts` | Field of view (shadowcasting) |
| `src/game.ts` | Game state, turns, combat, monster AI, pathing, save format |
| `src/render.ts` | Canvas renderer, wall autotiling, floating damage numbers |
| `src/main.ts` | Input (touch, pad, keyboard), HUD, menus, autosave |

## Credits

Graphics: [DawnLike 16x16 Universal Rogue-like tileset v1.81](https://opengameart.org/content/dawnlike-16x16-universal-rogue-like-tileset-v181) by **DragonDePlatino**, using the palette by **DawnBringer**, licensed under [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The sheets in `public/tiles/` are unmodified; see `public/tiles/LICENSE.txt`. As the artist asked, Platino is hidden somewhere in the game.
