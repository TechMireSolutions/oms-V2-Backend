// Customisation & Metadata Engine — public contract surface.
// Other modules (e.g. Admissions) call validateCustomData() before writing to
// their own custom_data JSONB column. The engine supplies definitions; owning
// modules remain the only writers of their data (modularity preserved).
import type {
  AuthContext, CreateFieldDefinition, CreateFormDefinition,
  TransitionRequest, DefinitionView, ValidationResult
} from "@oms/dto";

export const CUSTOMISATION_CONTRACT = Symbol("CUSTOMISATION_CONTRACT");

export interface CustomisationContract {
  // Authoring (creates DRAFT versions).
  createFieldDefinition(ctx: AuthContext, input: CreateFieldDefinition): Promise<DefinitionView>;
  createFormDefinition(ctx: AuthContext, input: CreateFormDefinition): Promise<DefinitionView>;

  // Lifecycle transitions (Draft → Preview → Publish → Rollback/Archive).
  transitionField(ctx: AuthContext, id: string, req: TransitionRequest): Promise<DefinitionView>;
  transitionForm(ctx: AuthContext, id: string, req: TransitionRequest): Promise<DefinitionView>;

  // Runtime: validate + sanitise user input against the PUBLISHED form, honoring
  // field-level write permissions in the caller's AuthContext.
  validateCustomData(
    ctx: AuthContext,
    entityType: string,
    formKey: string,
    input: Record<string, unknown>
  ): Promise<ValidationResult>;

  // Fetch the effective (published) form definition for the renderer.
  getPublishedForm(ctx: AuthContext, formKey: string): Promise<unknown>;
}

export const CUSTOMISATION_PERMISSIONS = {
  authorField: "meta.field.author",
  authorForm:  "meta.form.author",
  publish:     "meta.definition.publish",
  read:        "meta.definition.read"
} as const;
