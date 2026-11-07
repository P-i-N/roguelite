import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (GitHub Pages, itch.io, a local folder).
export default defineConfig({
  base: './',
});
