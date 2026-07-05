import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  server: {
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        verify: 'verify.html',
        lobby: 'lobby.html',
        game: 'game.html',
        weapons: 'weapons.html',
        leaderboard: 'leaderboard.html',
      },
    },
  },
});
