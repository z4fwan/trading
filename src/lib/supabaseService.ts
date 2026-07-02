import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from './supabase';

/** Service role client for tables that may extend beyond generated Database types. */
export type LooseServiceClient = SupabaseClient;

export function requireServiceClient(): LooseServiceClient {
  const client = getServiceClient();
  if (!client) throw new Error('SUPABASE_SERVICE_KEY not configured');
  return client as unknown as LooseServiceClient;
}

export function getLooseServiceClient(): LooseServiceClient | null {
  const client = getServiceClient();
  return client ? (client as unknown as LooseServiceClient) : null;
}
