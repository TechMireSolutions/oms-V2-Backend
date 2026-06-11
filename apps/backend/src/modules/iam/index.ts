// Public barrel for the IAM module.
// Other modules may import: the NestJS module class, the contract token + interface,
// and the route-level decorators/guards. Services, repositories, and DB models
// remain internal.
export { IamModule } from "./iam.module";
export * from "./contracts";
export { Public, RequirePermissions, CurrentUser } from "./decorators";
export { JwtAuthGuard } from "./guards/jwt-auth.guard";
export { PermissionsGuard } from "./guards/permissions.guard";
