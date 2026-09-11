import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api -> API_REST TFM (puerto 3000). Las imágenes de mapas también
// viven detrás de /api (el backend las sirve en /maps, pero el cliente las
// pide con el mismo prefijo /api que el resto de la REST), así que esta
// única regla cubre tanto los datos JSON como las imágenes de los mapas.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    port: Number(process.env.PORT) || 3001,
    host: '0.0.0.0',
  },
});
