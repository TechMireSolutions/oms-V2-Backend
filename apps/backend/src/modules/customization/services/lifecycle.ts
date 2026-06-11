import { BadRequestException } from "@nestjs/common";
import type { DefinitionStatus, LifecycleAction } from "@oms/dto";

// Allowed transitions for the Draft → Preview → Publish → Rollback machine.
//   DRAFT     → PREVIEW   (PROMOTE_PREVIEW)
//   DRAFT     → PUBLISHED (PUBLISH)            [skip preview]
//   PREVIEW   → PUBLISHED (PUBLISH)
//   PREVIEW   → DRAFT?    (not allowed; author a new version instead)
//   PUBLISHED → SUPERSEDED (system, when a newer version publishes)
//   *         → ARCHIVED  (ARCHIVE)
//   SUPERSEDED→ PUBLISHED (ROLLBACK — re-publish a prior version)
const TRANSITIONS: Record<LifecycleAction, { from: DefinitionStatus[]; to: DefinitionStatus }> = {
  PROMOTE_PREVIEW: { from: ["DRAFT"], to: "PREVIEW" },
  PUBLISH:         { from: ["DRAFT", "PREVIEW"], to: "PUBLISHED" },
  ARCHIVE:         { from: ["DRAFT", "PREVIEW", "PUBLISHED", "SUPERSEDED"], to: "ARCHIVED" },
  ROLLBACK:        { from: ["SUPERSEDED", "ARCHIVED"], to: "PUBLISHED" }
};

export function nextStatus(current: DefinitionStatus, action: LifecycleAction): DefinitionStatus {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(current))
    throw new BadRequestException(`Illegal transition: cannot ${action} from ${current}`);
  return rule.to;
}

export function isPublishing(action: LifecycleAction): boolean {
  return action === "PUBLISH" || action === "ROLLBACK";
}
