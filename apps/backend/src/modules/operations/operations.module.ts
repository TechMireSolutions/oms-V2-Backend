import { Module } from "@nestjs/common";
import { Controller, Get, Post, Put, Body, Param, Injectable } from "@nestjs/common";
import { randomInt } from "node:crypto";
import { getPrismaClient } from "@oms/db";
import { IamModule, CurrentUser, RequirePermissions } from "../iam";
import type { AuthContext } from "@oms/dto";

@Injectable()
class OperationsService {
  private readonly prisma = getPrismaClient();

  createAsset(d: { tag: string; name: string; category?: string; cost?: number }) {
    return this.prisma.asset.create({ data: { tag: d.tag, name: d.name, category: d.category ?? "hardware", cost: d.cost } });
  }
  inventory() { return this.prisma.asset.findMany({ orderBy: { createdAt: "desc" }, include: { allocations: { where: { returnedAt: null } } } }); }
  async allocate(d: { assetId: string; holderId: string; note?: string }) {
    await this.prisma.asset.update({ where: { id: d.assetId }, data: { status: "ALLOCATED" } });
    return this.prisma.assetAllocation.create({ data: { assetId: d.assetId, holderId: d.holderId, note: d.note } });
  }
  async returnAsset(id: string) {
    const alloc = await this.prisma.assetAllocation.findFirst({ where: { assetId: id, returnedAt: null } });
    if (alloc) await this.prisma.assetAllocation.update({ where: { id: alloc.id }, data: { returnedAt: new Date() } });
    return this.prisma.asset.update({ where: { id }, data: { status: "AVAILABLE" } });
  }
  ticket(ctx: AuthContext, d: { title: string; description?: string; priority?: string; facilityId?: string }) {
    return this.prisma.maintenanceTicket.create({
      data: {
        reference: `MNT-${new Date().getUTCFullYear()}-${String(randomInt(0, 1e6)).padStart(6, "0")}`,
        title: d.title, description: d.description, priority: d.priority ?? "MEDIUM",
        facilityId: d.facilityId, reportedById: ctx.userId
      }
    });
  }
  tickets() { return this.prisma.maintenanceTicket.findMany({ orderBy: { createdAt: "desc" } }); }
}

@Controller()
class OperationsController {
  constructor(private readonly svc: OperationsService) {}

  @Post("assets") @RequirePermissions("ops.asset.manage")
  create(@Body() b: any) { return this.svc.createAsset(b); }

  @Get("assets/inventory") @RequirePermissions("ops.asset.read")
  inventory() { return this.svc.inventory(); }

  @Post("assets/allocate") @RequirePermissions("ops.asset.manage")
  allocate(@Body() b: any) { return this.svc.allocate(b); }

  @Put("assets/return/:id") @RequirePermissions("ops.asset.manage")
  ret(@Param("id") id: string) { return this.svc.returnAsset(id); }

  @Post("maintenance/ticket") @RequirePermissions("ops.maintenance.create")
  ticket(@CurrentUser() ctx: AuthContext, @Body() b: any) { return this.svc.ticket(ctx, b); }

  @Get("maintenance/tickets") @RequirePermissions("ops.asset.read")
  tickets() { return this.svc.tickets(); }
}

@Module({ imports: [IamModule], controllers: [OperationsController], providers: [OperationsService] })
export class OperationsModule {}
