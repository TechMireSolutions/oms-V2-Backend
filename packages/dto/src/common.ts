import { z } from "zod";

export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;

export const AuthContextSchema = z.object({
  userId: UuidSchema,
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  locationId: UuidSchema.optional()
});
export type AuthContext = z.infer<typeof AuthContextSchema>;
