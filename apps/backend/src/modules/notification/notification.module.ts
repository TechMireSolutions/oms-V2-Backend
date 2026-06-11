import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { NOTIFICATION_CONTRACT } from "./contracts";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";

@Module({
  imports: [IamModule],
  controllers: [NotificationController],
  providers: [NotificationService, { provide: NOTIFICATION_CONTRACT, useExisting: NotificationService }],
  exports: [NOTIFICATION_CONTRACT]
})
export class NotificationModule {}
