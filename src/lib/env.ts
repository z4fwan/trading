function env(name: string): string | undefined {
  return process.env[`NEXT_PUBLIC_${name}`] || process.env[name];
}

const CRITICAL_VARS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
const IMPORTANT_VARS = ['SUPABASE_SERVICE_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
const OPTIONAL_VARS = ['OLLAMA_BASE_URL', 'DEEPSEEK_API_KEY'];

export function validateEnv(): string[] {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Critical: app won't work without these
  for (const v of CRITICAL_VARS) {
    const val = process.env[`NEXT_PUBLIC_${v}`] || process.env[v];
    if (!val) missing.push(v);
  }

  // Important: some features won't work
  for (const v of IMPORTANT_VARS) {
    const val = process.env[v];
    if (!val) warnings.push(v);
  }

  // Optional: nice-to-have
  for (const v of OPTIONAL_VARS) {
    const val = process.env[v];
    if (!val) warnings.push(v);
  }

  if (missing.length > 0) {
    console.error(`[Env] CRITICAL — missing required variables: ${missing.join(', ')}`);
    console.error(`[Env] Application will not start without these.`);
  }
  if (warnings.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(`[Env] WARN — missing optional variables: ${warnings.join(', ')}`);
    console.warn(`[Env] Some features may be limited (Telegram, Supabase persistence, LLM).`);
  }
  if (missing.length === 0 && warnings.length === 0) {
    console.log(`[Env] All environment variables present.`);
  }

  return missing;
}

export function envHealthy(): boolean {
  return validateEnv().length === 0;
}

/** Call once at startup to log full env status. */
export function logEnvStatus(): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_KEY;
  const hasTelegram = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  const hasOllama = !!process.env.OLLAMA_BASE_URL;
  const hasDeepseek = !!process.env.DEEPSEEK_API_KEY;

  console.log(`[Env] Supabase URL: ${supabaseUrl ? 'configured' : 'NOT SET'}`);
  console.log(`[Env] Supabase Service Key: ${hasServiceKey ? 'configured' : 'NOT SET — ML predictions will not persist'}`);
  console.log(`[Env] Telegram: ${hasTelegram ? 'configured' : 'NOT SET — alerts disabled'}`);
  console.log(`[Env] Ollama: ${hasOllama ? process.env.OLLAMA_BASE_URL : 'NOT SET — local LLM disabled'}`);
  console.log(`[Env] DeepSeek: ${hasDeepseek ? 'configured' : 'NOT SET — cloud LLM disabled'}`);
  console.log(`[Env] Platform: ${process.env.RENDER ? 'Render' : process.env.VERCEL ? 'Vercel' : 'Local'}`);
}
