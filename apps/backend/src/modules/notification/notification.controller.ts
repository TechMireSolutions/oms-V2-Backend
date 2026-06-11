import { Controller, Get, Query } from "@nestjs/common";
import { RequirePermissions } from "../iam";
import { NOTIFICATION_PERMISSIONS } from "./contracts";
import { NotificationService } from "./notification.service";

@Controller("notifications")
export class NotificationController {
  constructor(private readonly svc: NotificationService) {}

  @Get("log")
  @RequirePermissions(NOTIFICATION_PERMISSIONS.read)
  log(@Query("toUserId") toUserId?: string, @Query("limit") limit?: string) {
    return this.svc.log({ toUserId, limit: limit ? Number(limit) : undefined });
  }
}
