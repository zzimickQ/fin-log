import { buildApp } from "./app.js";
import { config } from "./lib/config.js";

const app = buildApp();

async function main() {
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Swagger UI: http://localhost:${config.PORT}/docs`);
    app.log.info(`Better Auth: http://localhost:${config.PORT}/api/auth`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, shutting down…`);
    await app.close();
    process.exit(0);
  });
}
