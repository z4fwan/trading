import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/z4fwa/OneDrive/Pictures/Documents/trading-dashboard/.env.local', override: true });

async function testOpenAICompat(name: string, url: string, key: string, model: string): Promise<string> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) {
      const t = await r.text();
      const m = (t.match(/"message":"([^"]{0,120})/) || [])[1] || t.slice(0, 120);
      return `FAIL ${r.status}: ${m}`;
    }
    const j: any = await r.json();
    return `OK (${j.choices?.[0]?.message?.content?.slice(0, 10)})`;
  } catch (e) {
    return `ERR ${String(e).slice(0, 100)}`;
  }
}

async function testGemini(url: string, key: string): Promise<string> {
  try {
    const r = await fetch(`${url}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply exactly: OK' }] }], generationConfig: { maxOutputTokens: 5 } }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) {
      const t = await r.text();
      const m = (t.match(/"message":"([^"]{0,120})/) || [])[1] || t.slice(0, 120);
      return `FAIL ${r.status}: ${m}`;
    }
    const j: any = await r.json();
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 10);
    return `OK (${text})`;
  } catch (e) {
    return `ERR ${String(e).slice(0, 100)}`;
  }
}

async function main() {
  const keys: Record<string, string> = {};
  const svc = (await import('./src/lib/supabase')).getServiceClient();
  if (svc) {
    const { data } = await svc.from('system_config').select('*');
    if (data) for (const row of data as any[]) keys[row.key_name] = row.key_value;
  }

  const groqEnv = (process.env.LLM_API_KEY || '').split(',').filter(Boolean);
  const groqDyn = (keys.LLM_API_KEY || '').split(',').filter(Boolean);
  const geminiEnv = (process.env.GEMINI_API_KEY || '').split(',').filter(Boolean);
  const geminiDyn = (keys.GEMINI_API_KEY || '').split(',').filter(Boolean);
  const deepseekEnv = (process.env.DEEPSEEK_API_KEY || '').split(',').filter(Boolean);
  const dsUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
  const dsModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  let gi = 0;
  for (const k of [...geminiEnv, ...geminiDyn]) {
    gi++;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}:generateContent`;
    console.log(`Gemini key #${gi}: ${await testGemini(url, k)}`);
  }
  let gr = 0;
  for (const k of [...groqEnv, ...groqDyn]) {
    gr++;
    console.log(`Groq key #${gr}: ${await testOpenAICompat('groq', 'https://api.groq.com/openai/v1/chat/completions', k, process.env.LLM_MODEL || 'openai/gpt-oss-20b')}`);
  }
  let ds = 0;
  for (const k of [...deepseekEnv]) {
    ds++;
    console.log(`DeepSeek key #${ds}: ${await testOpenAICompat('deepseek', dsUrl, k, dsModel)}`);
  }
  if (process.env.OPENAI_API_KEY) {
    console.log(`OpenAI: ${await testOpenAICompat('openai', 'https://api.openai.com/v1/chat/completions', process.env.OPENAI_API_KEY, 'gpt-4o-mini')}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
