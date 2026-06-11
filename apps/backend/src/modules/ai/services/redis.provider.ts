import { Provider } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "@oms/config";

export const AI_REDIS = Symbol("AI_REDIS");

export const aiRedisProvider: Provider = {
  provide: AI_REDIS,
  useFactory: (): Redis => {
    const client = new Redis(loadEnv().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    client.on("error", () => {});
    return client;
  }
};
