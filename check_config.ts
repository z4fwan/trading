import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/z4fwa/OneDrive/Pictures/Documents/trading-dashboard/.env.local', override: true });

async function main() {
  const { getServiceClient } = await import('./src/lib/supabase');
  const svc = getServiceClient();
  if (!svc) {
    console.log('No service client (SUPABASE_SERVICE_KEY missing?)');
    return;
  }
  const { data, error } = await svc.from('system_config').select('*');
  if (error) {
    console.log('ERROR:', error.message);
    return;
  }
  if (!data || data.length === 0) {
    console.log('system_config is empty');
    return;
  }
  for (const row of data) {
    const k = (row as any).key_name || (row as any).key || '(nokey)';
    const v = String((row as any).key_value || '');
    const masked = v.length > 10 ? `${v.slice(0, 6)}***${v.slice(-4)}` : '***';
    console.log(`${k} = ${masked}`);
  }
}

main().catch((e) => {
  console.error('ERR:', e);
  process.exit(1);
});
