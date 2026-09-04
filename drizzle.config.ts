import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './backend/cloud/db/schema.ts',
  dialect: 'sqlite',
});
