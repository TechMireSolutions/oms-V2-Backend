import { Provider } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "@oms/config";

export const BRANDING_REDIS = Symbol("BRANDING_REDIS");

export const brandingRedisProvider: Provider = {
  provide: BRANDING_REDIS,
  useFactory: (): Redis => {
    const client = new Redis(loadEnv().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    client.on("error", () => {});
    return client;
  }
};
