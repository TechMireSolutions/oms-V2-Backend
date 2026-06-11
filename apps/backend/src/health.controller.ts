import { Controller, Get } from "@nestjs/common";
import { Public } from "./modules/iam";

@Controller()
export class HealthController {
  @Public()
  @Get("healthz")
  health() {
    return { status: "ok", service: "oms-backend", time: new Date().toISOString() };
  }
}
