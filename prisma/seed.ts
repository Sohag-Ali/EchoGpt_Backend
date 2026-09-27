import { PrismaClient, RoleType, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting EchoGPT database seeding & data consistency check...');

  // 1. Ensure Roles exist (Idempotent - Lookup Table)
  const adminRole = await prisma.role.upsert({
    where: { name: RoleType.ADMIN },
    update: {},
    create: {
      name: RoleType.ADMIN,
      description: 'System Administrator with full management access',
    },
  });

  const userRole = await prisma.role.upsert({
    where: { name: RoleType.USER },
    update: {},
    create: {
      name: RoleType.USER,
      description: 'Standard EchoGPT Extension User',
    },
  });

  // Ensure default AI Providers exist
  await prisma.aIProvider.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'OpenAI GPT-4o',
      providerType: 'OPENAI',
      modelName: 'gpt-4o',
      isActive: true,
      isDefault: true,
      costPer1kInput: 0.0025,
      costPer1kOutput: 0.01,
    },
  });

  // 2. Read Seed Credentials from process.env
  const adminName = process.env.ADMIN_NAME || 'System Administrator';
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@echogpt.io').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminEchoGPT2026!SecretPass';

  const userName = process.env.USER_NAME || 'Standard User';
  const userEmail = (process.env.USER_EMAIL || 'user@echogpt.io').toLowerCase().trim();
  const userPassword = process.env.USER_PASSWORD || 'UserEchoGPT2026!SecretPass';

  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

  // Helper to compute firstName & lastName
  const parseNames = (fullName?: string | null) => {
    if (!fullName) return { firstName: null, lastName: null };
    const parts = fullName.trim().split(' ');
    const firstName = parts[0] || null;
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
    return { firstName, lastName };
  };

  // 3. Seed ADMIN Account
  const hashedAdminPassword = await bcrypt.hash(adminPassword, saltRounds);
  const seededAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      roleId: adminRole.id,
      isEmailVerified: true,
      isActive: true,
    },
    create: {
      email: adminEmail,
      name: adminName,
      password: hashedAdminPassword,
      isEmailVerified: true,
      isActive: true,
      roleId: adminRole.id,
    },
  });

  const adminNames = parseNames(adminName);
  await prisma.userProfile.upsert({
    where: { userId: seededAdmin.id },
    update: {},
    create: {
      userId: seededAdmin.id,
      firstName: adminNames.firstName,
      lastName: adminNames.lastName,
    },
  });

  console.log(`✅ Seeded ADMIN account & profile: ${seededAdmin.email} [ID: ${seededAdmin.id}]`);

  // 4. Seed USER Account with FREE Subscription & Profile
  const hashedUserPassword = await bcrypt.hash(userPassword, saltRounds);
  const seededUser = await prisma.user.upsert({
    where: { email: userEmail },
    update: {
      roleId: userRole.id,
      isEmailVerified: true,
      isActive: true,
    },
    create: {
      email: userEmail,
      name: userName,
      password: hashedUserPassword,
      isEmailVerified: true,
      isActive: true,
      roleId: userRole.id,
    },
  });

  const userNames = parseNames(userName);
  await prisma.userProfile.upsert({
    where: { userId: seededUser.id },
    update: {},
    create: {
      userId: seededUser.id,
      firstName: userNames.firstName,
      lastName: userNames.lastName,
    },
  });

  // Ensure active FREE subscription for seeded USER
  const existingSubscription = await prisma.subscription.findFirst({
    where: { userId: seededUser.id, status: SubscriptionStatus.ACTIVE },
  });

  if (!existingSubscription) {
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    await prisma.subscription.create({
      data: {
        userId: seededUser.id,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: oneYearFromNow,
      },
    });
  }

  console.log(`✅ Seeded USER account, profile & subscription: ${seededUser.email} [ID: ${seededUser.id}]`);

  // 5. Data Repair Routine: Ensure ALL existing users have a UserProfile
  const usersMissingProfile = await prisma.user.findMany({
    where: { profile: null },
  });

  if (usersMissingProfile.length > 0) {
    console.log(`🛠️ Repairing ${usersMissingProfile.length} existing user(s) missing UserProfile...`);
    for (const u of usersMissingProfile) {
      const { firstName, lastName } = parseNames(u.name || u.email.split('@')[0]);
      await prisma.userProfile.create({
        data: {
          userId: u.id,
          firstName,
          lastName,
          profileImage: u.avatarUrl || null,
          profileImageUrl: u.avatarUrl || null,
        },
      });
      console.log(`   -> Created UserProfile for ${u.email} [${u.id}]`);
    }
  } else {
    console.log('✨ All existing users already have UserProfile records.');
  }

  console.log('🎉 Database seeding & data repair completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
