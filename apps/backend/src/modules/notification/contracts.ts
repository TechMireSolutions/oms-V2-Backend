// Notification (Module 8) — public contract.
import type { AuthContext } from "@oms/dto";

export const NOTIFICATION_CONTRACT = Symbol("NOTIFICATION_CONTRACT");

export interface NotifyInput {
  template: string;
  toUserId?: string;
  toEmail?: string;
  data: Record<string, unknown>;
}

export interface NotificationContract {
  notify(ctx: AuthContext | null, input: NotifyInput): Promise<void>;
  log(opts: { toUserId?: string; limit?: number }): Promise<unknown[]>;
}

export const NOTIFICATION_PERMISSIONS = { read: "notification.read" } as const;
