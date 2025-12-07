import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Define process.env to prevent crashes in browser environments
  // where process is not defined (for the API_KEY check)
  define: {
    'process.env': {}
  }
});