import { Module, Controller, Get, Post, Body, Param, Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { getPrismaClient } from "@oms/db";
import { IamModule, CurrentUser, RequirePermissions } from "../iam";
import { AuditModule, AUDIT_CONTRACT, type AuditContract } from "../audit";
import { Inject } from "@nestjs/common";
import type { AuthContext } from "@oms/dto";

@Injectable()
class PolicyService {
  private readonly prisma = getPrismaClient();
  constructor(@Inject(AUDIT_CONTRACT) private readonly audit: AuditContract) {}

  // Create a new DRAFT version of a policy (creating the document if needed).
  async draft(ctx: AuthContext, d: { key: string; title: string; category?: string; body: string }) {
    const doc = await this.prisma.policyDocument.upsert({
      where: { key: d.key }, update: { title: d.title },
      create: { key: d.key, title: d.title, category: d.category ?? "general" }
    });
    const max = await this.prisma.policyVersion.aggregate({ where: { policyId: doc.id }, _max: { version: true } });
    const version = (max._max.version ?? 0) + 1;
    return this.prisma.policyVersion.create({
      data: { policyId: doc.id, version, status: "DRAFT", body: d.body, createdById: ctx.userId }
    });
  }

  async publish(ctx: AuthContext, versionId: string) {
    const v = await this.prisma.policyVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new NotFoundException("Policy version not found");
    await this.prisma.policyVersion.updateMany({ where: { policyId: v.policyId, status: "PUBLISHED" }, data: { status: "ARCHIVED" } });
    const published = await this.prisma.policyVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    await this.audit.logEvent({ actorId: ctx.userId, action: "policy.publish", entityType: "PolicyVersion", entityId: versionId });
    return published;
  }

  active() {
    return this.prisma.policyVersion.findMany({ where: { status: "PUBLISHED" }, include: { policy: true }, orderBy: { publishedAt: "desc" } });
  }

  async acknowledge(ctx: AuthContext, versionId: string) {
    const existing = await this.prisma.acknowledgementRecord.findFirst({ where: { policyVersionId: versionId, userId: ctx.userId } });
    if (existing) throw new ConflictException("Already acknowledged");
    return this.prisma.acknowledgementRecord.create({ data: { policyVersionId: versionId, userId: ctx.userId } });
  }

  async complianceStatus() {
    const versions = await this.prisma.policyVersion.findMany({ where: { status: "PUBLISHED" }, include: { policy: true, acknowledgements: true } });
    return versions.map((v) => ({ policy: v.policy.title, version: v.version, acknowledgements: v.acknowledgements.length }));
  }
}

@Controller("policies")
class PolicyController {
  constructor(private readonly svc: PolicyService) {}

  @Post("draft") @RequirePermissions("policy.manage")
  draft(@CurrentUser() ctx: AuthContext, @Body() b: any) { return this.svc.draft(ctx, b); }

  @Post(":id/publish") @RequirePermissions("policy.manage")
  publish(@CurrentUser() ctx: AuthContext, @Param("id") id: string) { return this.svc.publish(ctx, id); }

  @Get("active") @RequirePermissions("policy.read")
  active() { return this.svc.active(); }

  @Post(":id/acknowledge") @RequirePermissions("policy.read")
  ack(@CurrentUser() ctx: AuthContext, @Param("id") id: string) { return this.svc.acknowledge(ctx, id); }

  @Get("compliance-status") @RequirePermissions("policy.read")
  status() { return this.svc.complianceStatus(); }
}

@Module({ imports: [IamModule, AuditModule], controllers: [PolicyController], providers: [PolicyService] })
export class PolicyModule {}
