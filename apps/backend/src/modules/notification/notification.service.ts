import { Injectable, Logger } from "@nestjs/common";
import { getPrismaClient } from "@oms/db";
import type { AuthContext } from "@oms/dto";
import { type NotificationContract, type NotifyInput } from "./contracts";

// Outbound messaging. In production this enqueues to BullMQ and a worker
// delivers via SMTP/Twilio. For the running app it persists a NotificationLog
// row marked SENT (no external dependency), which is enough for in-app delivery
// and a durable audit of every message.
@Injectable()
export class NotificationService implements NotificationContract {
  private readonly prisma = getPrismaClient();
  private readonly logger = new Logger("Notification");

  async notify(_ctx: AuthContext | null, input: NotifyInput): Promise<void> {
    const tpl = await this.prisma.notificationTemplate.findUnique({ where: { key: input.template } }).catch(() => null);
    const channel = tpl?.channel ?? "inapp";
    this.logger.log(`notify ${input.template} -> ${input.toEmail ?? input.toUserId ?? "broadcast"} (${channel})`);
    await this.prisma.notificationLog.create({
      data: {
        template: input.template,
        channel,
        toUserId: input.toUserId,
        toAddress: input.toEmail,
        payload: JSON.stringify(input.data ?? {}),
        status: "SENT",
        sentAt: new Date()
      }
    });
  }

  async log(opts: { toUserId?: string; limit?: number }): Promise<unknown[]> {
    return this.prisma.notificationLog.findMany({
      where: opts.toUserId ? { toUserId: opts.toUserId } : {},
      orderBy: { createdAt: "desc" }, take: Math.min(opts.limit ?? 100, 500)
    });
  }
}
