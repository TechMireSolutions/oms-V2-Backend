import { Module, Controller, Get, Post, Body, Injectable } from "@nestjs/common";
import { getPrismaClient } from "@oms/db";
import { IamModule, RequirePermissions } from "../iam";

// Boundary to external systems (principally Moodle). Jobs are recorded and run
// idempotently with a result; real delivery would call Moodle's REST API with
// vaulted credentials and BullMQ retries/backoff.
@Injectable()
class IntegrationService {
  private readonly prisma = getPrismaClient();

  private async run(kind: string, payload: unknown) {
    const job = await this.prisma.syncJob.create({ data: { kind, status: "RUNNING", payload: JSON.stringify(payload ?? {}), attempts: 1 } });
    await this.prisma.integrationLog.create({ data: { jobId: job.id, level: "info", message: `${kind} started` } });
    // Simulated success (no external call in dev).
    const result = { ok: true, kind, processed: Array.isArray((payload as any)?.items) ? (payload as any).items.length : 0 };
    const done = await this.prisma.syncJob.update({ where: { id: job.id }, data: { status: "SUCCESS", result: JSON.stringify(result), finishedAt: new Date() } });
    await this.prisma.integrationLog.create({ data: { jobId: job.id, level: "info", message: `${kind} completed` } });
    return done;
  }

  syncGrades(payload: unknown) { return this.run("moodle.grades", payload); }
  provisionUser(payload: unknown) { return this.run("moodle.provision", payload); }
  jobs() { return this.prisma.syncJob.findMany({ orderBy: { createdAt: "desc" }, take: 100 }); }
}

@Controller("integration")
class IntegrationController {
  constructor(private readonly svc: IntegrationService) {}

  @Post("moodle/sync-grades") @RequirePermissions("integration.manage")
  grades(@Body() b: any) { return this.svc.syncGrades(b); }

  @Post("moodle/provision-user") @RequirePermissions("integration.manage")
  provision(@Body() b: any) { return this.svc.provisionUser(b); }

  @Get("jobs") @RequirePermissions("integration.read")
  jobs() { return this.svc.jobs(); }
}

@Module({ imports: [IamModule], controllers: [IntegrationController], providers: [IntegrationService] })
export class IntegrationModule {}
