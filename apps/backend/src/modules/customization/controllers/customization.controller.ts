import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import {
  CreateFieldDefinitionSchema, CreateFormDefinitionSchema, TransitionRequestSchema,
  type AuthContext, type DefinitionView
} from "@oms/dto";
import { CurrentUser, RequirePermissions } from "../../iam";
import { CUSTOMISATION_PERMISSIONS } from "../contracts";
import { CustomizationService } from "../services/customization.service";

@Controller("meta")
export class CustomizationController {
  constructor(private readonly svc: CustomizationService) {}

  @Post("fields")
  @RequirePermissions(CUSTOMISATION_PERMISSIONS.authorField)
  async createField(@CurrentUser() ctx: AuthContext, @Body() body: unknown): Promise<DefinitionView> {
    const parsed = CreateFieldDefinitionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.createFieldDefinition(ctx, parsed.data);
  }

  @Post("forms")
  @RequirePermissions(CUSTOMISATION_PERMISSIONS.authorForm)
  async createForm(@CurrentUser() ctx: AuthContext, @Body() body: unknown): Promise<DefinitionView> {
    const parsed = CreateFormDefinitionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.createFormDefinition(ctx, parsed.data);
  }

  @Put("fields/:id/transition")
  @RequirePermissions(CUSTOMISATION_PERMISSIONS.read) // PUBLISH escalates inside the service
  async transitionField(
    @CurrentUser() ctx: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown
  ): Promise<DefinitionView> {
    const parsed = TransitionRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.transitionField(ctx, id, parsed.data);
  }

  @Put("forms/:id/transition")
  @RequirePermissions(CUSTOMISATION_PERMISSIONS.read)
  async transitionForm(
    @CurrentUser() ctx: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown
  ): Promise<DefinitionView> {
    const parsed = TransitionRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.transitionForm(ctx, id, parsed.data);
  }

  // Effective published form for the schema-driven renderer.
  @Get("forms/:key")
  @RequirePermissions(CUSTOMISATION_PERMISSIONS.read)
  async getForm(@CurrentUser() ctx: AuthContext, @Param("key") key: string): Promise<unknown> {
    return this.svc.getPublishedForm(ctx, key);
  }
}
