import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// playground 开发服务器：固定端口 5199，允许跨包目录读取源码
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5199,
    fs: { allow: ['..'] },
  },
});
