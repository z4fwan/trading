function env(name: string): string | undefined {
  return process.env[`NEXT_PUBLIC_${name}`] || process.env[name];
}

export function validateEnv(): string[] {
  const missing: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!env('ADMIN_EMAIL')) missing.push('ADMIN_EMAIL or NEXT_PUBLIC_ADMIN_EMAIL');
  if (!env('ADMIN_PASSWORD')) missing.push('ADMIN_PASSWORD or NEXT_PUBLIC_ADMIN_PASSWORD');

  if (!process.env.SUPABASE_SERVICE_KEY) console.warn('[Env] SUPABASE_SERVICE_KEY not set — background engine will not persist ML results');
  if (missing.length > 0) console.error(`[Env] Missing required variables: ${missing.join(', ')}`);

  return missing;
}

export function envHealthy(): boolean {
  return validateEnv().length === 0;
}
