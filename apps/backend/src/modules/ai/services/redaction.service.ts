import { Injectable } from "@nestjs/common";
import type { DataClassification } from "@oms/dto";

export interface RedactionResult {
  redacted: string;
  classification: DataClassification;
  hits: { type: string; count: number }[];
}

/**
 * Mandatory privacy gate. Runs BEFORE any provider call. Masks PII and assigns
 * a data classification. SENSITIVE => the router will force a local model.
 *
 * Detection is conservative (high recall): when in doubt, classify up. This
 * protects welfare/financial confidentiality even at the cost of routing more
 * traffic to the local model.
 */
@Injectable()
export class RedactionService {
  private readonly patterns: { type: string; re: RegExp; classifies: DataClassification }[] = [
    { type: "EMAIL",        re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, classifies: "INTERNAL" },
    { type: "PHONE",        re: /(?<!\d)(\+?\d[\d ()-]{7,}\d)(?!\d)/g,             classifies: "INTERNAL" },
    // National ID / SSS / TIN-like sequences.
    { type: "GOV_ID",       re: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b|\b\d{9,12}\b/g,     classifies: "SENSITIVE" },
    // Credit-card-ish / bank account numbers.
    { type: "ACCOUNT_NO",   re: /\b(?:\d[ -]?){13,19}\b/g,                         classifies: "SENSITIVE" },
    // Money amounts (₱, $, PHP, USD).
    { type: "MONEY",        re: /(?:₱|\$|PHP|USD)\s?\d[\d,]*(?:\.\d{1,2})?/gi,      classifies: "SENSITIVE" }
  ];

  // Keyword triggers that force SENSITIVE even without a structured match.
  private readonly sensitiveKeywords = /\b(welfare|subsidy|fee\s*waiver|hardship|salary|payroll|income|bank|ledger|journal\s*entry)\b/i;

  redact(input: string): RedactionResult {
    let redacted = input;
    const hits: { type: string; count: number }[] = [];
    let classification: DataClassification = "PUBLIC";

    const bump = (c: DataClassification) => {
      const order: DataClassification[] = ["PUBLIC", "INTERNAL", "SENSITIVE"];
      if (order.indexOf(c) > order.indexOf(classification)) classification = c;
    };

    for (const p of this.patterns) {
      const matches = redacted.match(p.re);
      if (matches?.length) {
        hits.push({ type: p.type, count: matches.length });
        redacted = redacted.replace(p.re, `[${p.type}_REDACTED]`);
        bump(p.classifies);
      }
    }

    if (this.sensitiveKeywords.test(input)) {
      bump("SENSITIVE");
      hits.push({ type: "SENSITIVE_KEYWORD", count: 1 });
    }

    return { redacted, classification, hits };
  }
}
