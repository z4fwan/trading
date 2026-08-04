import type { LLMProviderName } from './llmProvider';

const STORAGE_KEY = 'aiEnginePreference';

const ENGINE_MAP: Record<string, LLMProviderName> = {
  auto: 'none',
  groq: 'groq',
  openrouter: 'custom',
  deepseek: 'deepseek',
  openai: 'openai',
};

export function getPreferredEngine(): LLMProviderName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in ENGINE_MAP) return ENGINE_MAP[stored];
  } catch {}
  return 'none';
}

export function setPreferredEngine(engine: string): void {
  try { localStorage.setItem(STORAGE_KEY, engine); } catch {}
}

export function getEngineForLLM(): LLMProviderName | undefined {
  const pref = getPreferredEngine();
  return pref === 'none' ? undefined : pref;
}
