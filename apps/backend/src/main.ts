import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadEnv } from "@oms/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  await app.listen(env.PORT);
  // eslint-disable-next-line no-console
  console.log(`OMS backend listening on http://localhost:${env.PORT}`);
}

void bootstrap();
