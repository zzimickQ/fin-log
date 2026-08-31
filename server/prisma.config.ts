// Prisma CLI configuration (Prisma 7+).
// Required so `prisma migrate`, `prisma generate`, etc. can resolve the
// datasource URL and schema path. Environment variables are NOT auto-loaded
// in Prisma 7, hence the explicit `import "dotenv/config"`.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
