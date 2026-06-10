export type SeedAdminConfig = {
  email: string;
  password: string;
  name: string;
  lastName: string;
  phone: string | null;
};

export function readSeedAdminConfig(): SeedAdminConfig | null {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return null;

  const phone = process.env.SEED_ADMIN_PHONE?.trim();
  return {
    email,
    password,
    name: process.env.SEED_ADMIN_NAME?.trim() || 'Admin',
    lastName: process.env.SEED_ADMIN_LAST_NAME?.trim() || 'User',
    phone: phone || null,
  };
}
