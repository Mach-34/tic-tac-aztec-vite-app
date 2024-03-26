import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: {
      'process.env': env
    },
    plugins: [react(), nodePolyfills()],
    resolve: {
      alias: {
        artifacts: "/src/artifacts",
        assets: "/src/assets",
        components: "/src/components",
        contexts: "/src/contexts",
        hooks: "/src/hooks",
        layouts: "/src/layouts",
        utils: "/src/utils",
        views: "/src/views",
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "esnext",
        define: {
          global: 'globalThis'
        },
      },
    },
  }
})
