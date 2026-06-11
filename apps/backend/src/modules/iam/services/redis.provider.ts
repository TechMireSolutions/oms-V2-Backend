import { Provider } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "@oms/config";

export const REDIS = Symbol("REDIS");

export const redisProvider: Provider = {
  provide: REDIS,
  useFactory: (): Redis => {
    const client = new Redis(loadEnv().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    // Prevent an unhandled 'error' event from crashing the process when Redis
    // is unavailable (e.g. local dev without a Redis server).
    client.on("error", () => {});
    return client;
  }
};
