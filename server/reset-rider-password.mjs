// One-shot script: reset testrider password and confirm bcrypt works
// Run from /server: node reset-rider-password.mjs

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'testrider@veltomobility.com.ng';
  const password = 'Test1234!';

  // Check user exists
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error('❌ User not found:', email);
    process.exit(1);
  }
  console.log('✅ User found:', user.email, '| role:', user.role, '| isActive:', user.isActive);

  // Hash and update
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { email }, data: { passwordHash } });
  console.log('✅ Password hash updated');

  // Verify immediately
  const updated = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, updated.passwordHash);
  console.log('✅ Verification:', valid ? 'PASS — login will work' : '❌ FAIL — something is wrong');
}

main().catch(console.error).finally(() => prisma.$disconnect());
