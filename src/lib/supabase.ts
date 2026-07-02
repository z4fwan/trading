import { createClient } from '@supabase/supabase-js';
import type { Database } from './supabase-types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabase() {
  if (!_client && supabaseUrl && supabaseAnonKey) {
    _client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _client;
}

let _serviceClient: ReturnType<typeof createClient<Database>> | null = null;

export function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey || !supabaseUrl) return null;
  if (!_serviceClient) {
    _serviceClient = createClient<Database>(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serviceClient;
}

export type SupabaseClient = ReturnType<typeof getSupabase>;
