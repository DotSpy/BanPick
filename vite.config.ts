import { defineConfig } from 'vite';

// BASE_PATH is the public path the site is served from. GitHub project pages live under /<repo>/, so the
// Pages workflow sets it to "/BanPick/"; a local dev server or a custom domain keeps the default "/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
});
