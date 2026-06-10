/* eslint-disable no-console */
import AppDataSource from './data-source';
import { User } from './entities';
import { readSeedAdminConfig } from './config/seed-admin';

export default async function seedAdminUser(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const activeUsersCount = await userRepo.count({ where: { active: true } });
  if (activeUsersCount > 0) return;

  const config = readSeedAdminConfig();
  if (!config) {
    console.warn(
      '[seed] no active users and SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD unset — skipping admin bootstrap'
    );
    return;
  }

  const admin = userRepo.create({
    email: config.email,
    password: config.password,
    name: config.name,
    lastName: config.lastName,
    phone: config.phone,
    active: true,
    createdAt: new Date(),
  });
  await userRepo.save(admin);
  console.log(`[seed] created admin user ${config.email}`);
}
