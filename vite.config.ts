/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export const CSP = "default-src 'self'; worker-src 'self' blob:";

/**
 * Injects the CSP <meta> tag into built HTML only. In dev, the React refresh
 * preamble is an inline script and HMR uses a websocket, both of which this
 * strict policy would block. `vite preview` additionally gets the header.
 */
function cspPlugin(): Plugin {
  return {
    name: 'cryptex3d-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.server) return html;
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        );
      },
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', CSP);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin()],
  build: {
    // The lazy `three` vendor chunk (core + post-processing addons) is ~610 kB minified, ~153 kB gzip.
    chunkSizeWarningLimit: 700,
    // Never inline assets: data: URIs for fonts/images are blocked by the strict CSP.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (/node_modules\/(three|@react-three)\//.test(id)) return 'three';
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
            if (/node_modules\/@huggingface\//.test(id)) return 'auditor-ml';
            if (/node_modules\/qrcode\//.test(id)) return 'p2p-qr';
            if (/node_modules\/tailwindcss\//.test(id)) return 'tailwind';
            if (/node_modules\/@fontsource/.test(id)) return undefined; // CSS only; emitted with the entry CSS
            return undefined;
          }
          if (/\.worker\.[tj]s/.test(id) || /\/src\/core\/(crypto|stego|auditor)\//.test(id)) {
            const m = /\/src\/core\/(crypto|stego|auditor)\//.exec(id);
            return m ? `worker-${m[1]}` : 'workers';
          }
          if (/\/src\/core\/p2p\//.test(id)) return 'p2p';
          return undefined;
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
