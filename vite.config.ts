import { defineConfig } from 'vite';

export default defineConfig({
  server: { open: true },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        lobby: 'lobby.html',
        game: 'game.html',
      },
    },
  },
});
