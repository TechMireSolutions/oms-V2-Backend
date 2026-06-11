import { Controller, Get, Param, Query } from "@nestjs/common";
import { RequirePermissions } from "../iam";
import { AUDIT_PERMISSIONS } from "./contracts";
import { AuditService } from "./audit.service";

@Controller("audit")
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get("history/:entityType/:entityId")
  @RequirePermissions(AUDIT_PERMISSIONS.read)
  history(@Param("entityType") entityType: string, @Param("entityId") entityId: string) {
    return this.svc.history(entityType, entityId);
  }

  @Get("search")
  @RequirePermissions(AUDIT_PERMISSIONS.read)
  search(@Query("action") action?: string, @Query("actorId") actorId?: string, @Query("limit") limit?: string) {
    return this.svc.search({ action, actorId, limit: limit ? Number(limit) : undefined });
  }
}
