/**
 * Unified LLM routing — priority:
 * 1. Gemini (Google AI Studio — GEMINI_API_KEY) — gemini-2.0-flash, best quality + free tier
 * 2. DeepSeek (DEEPSEEK_API_KEY) — strong reasoning, very cheap
 * 3. Groq (LLM_API_KEY) — free Llama, fast
 * 4. OpenAI (OPENAI_API_KEY) — paid GPT-4o-mini
 *
 * Gemini API uses a different shape from OpenAI — handled natively here.
 */

import { getServiceClient } from './supabase';

export type LLMProviderName = 'gemini' | 'deepseek' | 'groq' | 'openai' | 'custom' | 'none';

export interface LLMConfig {
  key: string;
  url: string;
  model: string;
  provider: LLMProviderName;
}

const dynamicFallbackKeys: Record<string, string> = {};
let dynamicKeysFetched = false;

// Async poller to update keys from Supabase without restarting Render
async function fetchDynamicKeys() {
  const svc = getServiceClient();
  if (!svc) return;
  try {
    const { data } = await svc.from('system_config').select('*');
    if (data) {
      data.forEach((row: { key_name: string; key_value: string }) => {
        dynamicFallbackKeys[row.key_name] = row.key_value;
      });
      dynamicKeysFetched = true;
    }
  } catch { /* ignore */ }
}
if (typeof process !== 'undefined') {
  fetchDynamicKeys();
  setInterval(fetchDynamicKeys, 60000);
}

function getEnvOrDynamic(keyName: string): string | undefined {
  const envVal = process.env[keyName]?.trim();
  const dynVal = dynamicFallbackKeys[keyName]?.trim();
  if (envVal && dynVal) return `${envVal},${dynVal}`;
  return envVal || dynVal;
}

function stripMarkdownCodeBlock(s: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return m ? m[1].trim() : s.trim();
}

// ─── Provider resolution ──────────────────────────────────────────────────────

function buildProviderChain(): LLMConfig[] {
  const out: LLMConfig[] = [];
  
  const geminiKeys = (getEnvOrDynamic('GEMINI_API_KEY') || '').split(',').map(k => k.trim()).filter(Boolean);
  for (const gemini of geminiKeys) {
    const model = getEnvOrDynamic('GEMINI_MODEL') || 'gemini-2.0-flash';
    out.push({
      key: gemini,
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      model,
      provider: 'gemini',
    });
  }

  const deepseekKeys = (getEnvOrDynamic('DEEPSEEK_API_KEY') || '').split(',').map(k => k.trim()).filter(Boolean);
  for (const deepseek of deepseekKeys) {
    out.push({
      key: deepseek,
      url: getEnvOrDynamic('DEEPSEEK_API_URL') || 'https://api.deepseek.com/v1/chat/completions',
      model: getEnvOrDynamic('DEEPSEEK_MODEL') || 'deepseek-chat',
      provider: 'deepseek',
    });
  }

  const groqKeys = (getEnvOrDynamic('LLM_API_KEY') || '').split(',').map(k => k.trim()).filter(Boolean);
  for (const groq of groqKeys) {
    const url = getEnvOrDynamic('LLM_API_URL') || 'https://api.groq.com/openai/v1/chat/completions';
    const isOpenAi = url.includes('api.openai.com');
    out.push({
      key: groq,
      url,
      model: getEnvOrDynamic('LLM_MODEL') || (isOpenAi ? 'gpt-4o-mini' : 'openai/gpt-oss-20b'),
      provider: isOpenAi ? 'openai' : url.includes('groq') ? 'groq' : 'custom',
    });
  }

  const openaiKeys = (getEnvOrDynamic('OPENAI_API_KEY') || '').split(',').map(k => k.trim()).filter(Boolean);
  for (const openai of openaiKeys) {
    const url = getEnvOrDynamic('OPENAI_API_URL') || 'https://api.openai.com/v1/chat/completions';
    out.push({
      key: openai,
      url,
      model: getEnvOrDynamic('OPENAI_MODEL') || 'gpt-4o-mini',
      provider: url.includes('openrouter') ? 'custom' : 'openai',
    });
  }
  return out;
}

let rrCursor = 0;

export function resolveLLMConfig(): LLMConfig | null {
  const chain = buildProviderChain();
  return chain[0] || null;
}

export function getLLMProviderInfo(): {
  configured: boolean;
  provider: LLMProviderName;
  model: string;
  note: string;
} {
  const chain = buildProviderChain();
  const cfg = chain[0];
  if (!cfg) {
    return {
      configured: false,
      provider: 'none',
      model: '',
      note: 'Set GEMINI_API_KEY (Google AI Studio, free tier) — or DEEPSEEK_API_KEY / LLM_API_KEY (Groq) / OPENAI_API_KEY',
    };
  }
  const notes: Record<LLMProviderName, string> = {
    gemini: 'Google Gemini (AI Studio) — gemini-2.0-flash, generous free tier, excellent reasoning',
    deepseek: 'DeepSeek API — strong reasoning; very cheap paid-per-token',
    groq: 'Groq free tier — fast Llama',
    openai: 'OpenAI GPT',
    custom: 'Custom OpenAI-compatible endpoint',
    none: '',
  };
  return {
    configured: true,
    provider: cfg.provider,
    model: cfg.model,
    note: chain.length > 1
      ? `${notes[cfg.provider]} (fallbacks: ${chain.slice(1).map(c => c.provider).join(' -> ')})`
      : notes[cfg.provider],
  };
}

export function isLLMConfigured(): boolean {
  return resolveLLMConfig() !== null;
}

/** @deprecated use resolveLLMConfig */
export function getApiConfig(): { key: string; url: string; model: string } | null {
  const c = resolveLLMConfig();
  if (!c) return null;
  return { key: c.key, url: c.url, model: c.model };
}

// ─── Gemini native call ───────────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
    finishReason?: string;
  }[];
  error?: { message?: string; code?: number };
}

async function callGemini(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  signal: AbortSignal,
): Promise<string | null> {
  /**
   * Gemini generateContent API:
   * POST /v1beta/models/{model}:generateContent?key={apiKey}
   * Body: { system_instruction, contents, generationConfig }
   */
  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      // Ask for JSON output when prompts end with "Return ONLY valid JSON"
      responseMimeType: userPrompt.includes('JSON') || systemPrompt.includes('valid JSON')
        ? 'application/json'
        : 'text/plain',
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  const res = await fetch(`${config.url}?key=${config.key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn(`[Gemini] API ${res.status}: ${errText.slice(0, 300)}`);
    return null;
  }

  const data = await res.json() as GeminiResponse;
  if (data.error) {
    console.warn(`[Gemini] Error ${data.error.code}: ${data.error.message}`);
    return null;
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  return text ? stripMarkdownCodeBlock(text) : null;
}

// ─── OpenAI-compatible call ───────────────────────────────────────────────────

async function callOpenAICompat(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  signal: AbortSignal,
): Promise<string | null> {
  const res = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.key}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn(`[${config.provider}] API ${res.status}: ${errText.slice(0, 300)}`);
    return null;
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? null;
  return text ? stripMarkdownCodeBlock(text) : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Rate limit tracking to implement exponential backoff
const rateLimitState = new Map<string, { count: number; resetAt: number; backoffUntil: number }>();

function shouldRetryAfterRateLimit(provider: string): { shouldRetry: boolean; waitMs: number } {
  const state = rateLimitState.get(provider);
  if (!state) return { shouldRetry: false, waitMs: 0 };
  
  const now = Date.now();
  if (now < state.backoffUntil) {
    return { shouldRetry: true, waitMs: state.backoffUntil - now };
  }
  return { shouldRetry: false, waitMs: 0 };
}

function recordRateLimit(provider: string, retryAfterSeconds?: number) {
  const state = rateLimitState.get(provider) || { count: 0, resetAt: 0, backoffUntil: 0 };
  state.count++;
  // Exponential backoff: 30s, 60s, 120s, 300s, max 600s
  const backoffMs = Math.min(600000, 30000 * Math.pow(2, Math.min(state.count - 1, 4)));
  state.backoffUntil = Date.now() + backoffMs;
  if (retryAfterSeconds) {
    state.resetAt = Date.now() + retryAfterSeconds * 1000;
  }
  rateLimitState.set(provider, state);
  console.warn(`[LLM] Rate limit on ${provider}, backoff for ${backoffMs / 1000}s (attempt ${state.count})`);
}

function isRateLimited(provider: string): boolean {
  const { shouldRetry } = shouldRetryAfterRateLimit(provider);
  return shouldRetry;
}

function extractRetryAfter(errorText: string): number | undefined {
  // Try to extract Retry-After from error text
  const match = errorText.match(/Retry-After["\s:=]+(\d+)/i);
  if (match) return parseInt(match[1], 10);
  // Default to 60 seconds if we detect rate limiting but can't parse exact time
  if (errorText.includes('429') || errorText.includes('rate limit') || errorText.includes('Rate limit')) {
    return 60;
  }
  return undefined;
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 400,
  temperature = 0.35,
  preferredProvider?: LLMProviderName,
): Promise<{ content: string | null; error: string | null; provider: LLMProviderName }> {
  let chain = buildProviderChain();
  if (preferredProvider) {
    const preferredChain = chain.filter(c => c.provider === preferredProvider);
    if (preferredChain.length > 0) chain = preferredChain;
  }

  if (!chain.length) return { content: null, error: 'No LLM API key configured', provider: 'none' };

  // Filter out rate-limited providers (unless all are rate-limited)
  const availableChain = chain.filter(c => !isRateLimited(c.provider));
  if (availableChain.length === 0 && chain.length > 0) {
    // All providers rate-limited, use the one with shortest backoff
    let minBackoff = Infinity;
    let bestProvider = chain[0];
    for (const c of chain) {
      const { waitMs } = shouldRetryAfterRateLimit(c.provider);
      if (waitMs < minBackoff) {
        minBackoff = waitMs;
        bestProvider = c;
      }
    }
    console.warn(`[LLM] All providers rate-limited, waiting ${minBackoff / 1000}s before retry`);
    await new Promise(r => setTimeout(r, Math.min(minBackoff, 30000)));
    // Re-check after wait
    const recheckChain = chain.filter(c => !isRateLimited(c.provider));
    if (recheckChain.length > 0) {
      chain = recheckChain;
    }
  } else if (availableChain.length > 0) {
    chain = availableChain;
  }

  // Round-Robin Rotation: evenly distribute load across all available keys
  rrCursor = (rrCursor + 1) % chain.length;
  const rotatedChain = [...chain.slice(rrCursor), ...chain.slice(0, rrCursor)];

  const errors: string[] = [];
  try {
    for (const config of rotatedChain) {
      // Skip if this provider is currently rate-limited
      if (isRateLimited(config.provider)) {
        errors.push(`[${config.provider}] rate-limited, skipping`);
        continue;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 28000);
      try {
        let content: string | null = null;
        if (config.provider === 'gemini') {
          content = await callGemini(config, systemPrompt, userPrompt, maxTokens, temperature, controller.signal);
        } else {
          content = await callOpenAICompat(config, systemPrompt, userPrompt, maxTokens, temperature, controller.signal);
        }
        if (content) {
          // Reset rate limit counter on success
          const state = rateLimitState.get(config.provider);
          if (state && state.count > 0) {
            state.count = Math.max(0, state.count - 1);
          }
          return {
            content,
            error: null,
            provider: config.provider,
          };
        }
        errors.push(`[${config.provider}] empty response`);
      } catch (e) {
        const errStr = String(e);
        errors.push(`[${config.provider}] ${errStr}`);
        
        // Check if this is a rate limit error
        if (errStr.includes('429') || errStr.includes('rate limit') || errStr.includes('Rate limit')) {
          const retryAfter = extractRetryAfter(errStr);
          recordRateLimit(config.provider, retryAfter);
          // Wait before trying next provider
          const waitMs = retryAfter ? Math.min(retryAfter * 1000, 10000) : 2000;
          await new Promise(r => setTimeout(r, waitMs));
        }
      } finally {
        clearTimeout(timer);
      }
    }
    return {
      content: null,
      error: errors.join(' | ') || 'All providers failed',
      provider: chain[0].provider,
    };
  } catch (e) {
    const errMsg = `LLM fetch error: ${e}`;
    console.warn(`[LLM] ${errMsg}`);
    return { content: null, error: errMsg, provider: chain[0].provider };
  }
}

export async function callLLMJson<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1200,
  preferredProvider?: LLMProviderName,
): Promise<{ data: T | null; error: string | null }> {
  const { content, error } = await callLLM(systemPrompt, userPrompt, maxTokens, 0.3, preferredProvider);
  if (!content) return { data: null, error };
  try {
    return { data: JSON.parse(content) as T, error: null };
  } catch {
    // Gemini sometimes wraps even with responseMimeType set — try one more strip
    try {
      const stripped = content.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '');
      return { data: JSON.parse(stripped) as T, error: null };
    } catch {
      return { data: null, error: 'Invalid JSON from LLM' };
    }
  }
}
