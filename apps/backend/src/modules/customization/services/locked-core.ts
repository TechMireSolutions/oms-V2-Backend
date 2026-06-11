import { BadRequestException, Injectable } from "@nestjs/common";
import type { CreateFieldDefinition } from "@oms/dto";

/**
 * Locked-core governance (Part M): what keeps "dynamic" from becoming
 * "dangerous". The Customisation engine may add display fields and metadata
 * AROUND the finance ledger and audit trail, but can never alter the
 * invariants that keep the books balanced and the audit trail trustworthy.
 */
@Injectable()
export class LockedCoreGuard {
  // Entities whose physical structure is immutable. Custom fields here are
  // permitted ONLY as read-only display metadata (never writable, never required).
  private readonly readOnlyEntities = new Set(["JournalEntry", "JournalLine", "AuditEvent", "RefreshSession"]);

  // Reserved keys per entity — cannot be shadowed by a custom field, because a
  // core column already owns them.
  private readonly reservedKeys: Record<string, Set<string>> = {
    Application: new Set(["id", "reference", "status", "applicantId", "programKey", "customData"]),
    WelfareRequest: new Set(["id", "reference", "status", "applicantId", "type", "requestedAmount", "customData"]),
    JournalEntry: new Set(["id", "entryNo", "status", "debit", "credit", "postedById", "preparedById"]),
    JournalLine: new Set(["id", "debit", "credit", "accountId", "entryId"])
  };

  assertFieldAllowed(input: CreateFieldDefinition): void {
    const reserved = this.reservedKeys[input.entityType];
    if (reserved?.has(input.key))
      throw new BadRequestException(
        `'${input.key}' is a locked core field on ${input.entityType} and cannot be redefined`
      );

    if (this.readOnlyEntities.has(input.entityType)) {
      if (input.writePermission || input.required)
        throw new BadRequestException(
          `${input.entityType} is locked-core: custom fields may be read-only display metadata only ` +
          `(no writePermission, not required)`
        );
    }
  }
}
