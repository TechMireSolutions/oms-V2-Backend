// OMS dev seed — creates a SuperAdmin role + user.
// Run from repo root:  node --env-file=.env apps/backend/seed.mjs
import { getPrismaClient } from "@oms/db";
import argon2 from "argon2";

const EMAIL = "admin@oms.local";
const PASSWORD = "Admin12345!";

const prisma = getPrismaClient();

async function main() {
  const role = await prisma.role.upsert({
    where: { key: "super_admin" },
    update: {},
    create: { key: "super_admin", name: "Super Admin", description: "Full system access", isSystem: true }
  });

  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, isActive: true, mfaEnrolled: false },
    create: { email: EMAIL, passwordHash, isActive: true, mfaEnrolled: false }
  });

  const existing = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
  if (!existing) await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  console.log("Seeded SuperAdmin:");
  console.log("  email:   ", EMAIL);
  console.log("  password:", PASSWORD);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
