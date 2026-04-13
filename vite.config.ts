import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: { printWidth: 120, singleQuote: true },
  lint: { options: { typeAware: true, typeCheck: true } },
});
