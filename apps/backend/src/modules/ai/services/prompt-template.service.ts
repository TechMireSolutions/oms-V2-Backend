import { Injectable, NotFoundException } from "@nestjs/common";
import { getPrismaClient } from "@oms/db";
import type { AiProvider } from "@oms/dto";

export interface ResolvedTemplate {
  key: string;
  version: number;
  rendered: string;
  defaultProvider: AiProvider;
  defaultModel: string | null;
}

/**
 * Loads the PUBLISHED version of a versioned prompt template and renders it by
 * substituting {{variables}}. Templates reuse the same Draft→Preview→Publish
 * lifecycle as the Customisation engine, so admin-facing prompts are reviewable
 * and auditable.
 */
@Injectable()
export class PromptTemplateService {
  private readonly prisma = getPrismaClient();

  async render(key: string, variables: Record<string, string>): Promise<ResolvedTemplate> {
    const tpl = await this.prisma.promptTemplate.findFirst({
      where: { key, status: "PUBLISHED" }, orderBy: { version: "desc" }
    });
    if (!tpl) throw new NotFoundException(`No published prompt template '${key}'`);

    const rendered = tpl.template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name: string) => {
      const v = variables[name];
      if (v === undefined) throw new NotFoundException(`Missing template variable '${name}'`);
      return v;
    });

    return {
      key: tpl.key, version: tpl.version, rendered,
      defaultProvider: tpl.defaultProvider as AiProvider, defaultModel: tpl.defaultModel
    };
  }
}
