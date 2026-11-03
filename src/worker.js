// Build script vloží UI a projektový Skill přímo do Worker balíčku.
const HTML = __UI_HTML__;
const CSS = __UI_CSS__;
const JS = __UI_JS__;
const SOURCE_SKILL = __SOURCE_SKILL__;

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_FAST_MODEL = 'claude-haiku-5-5';
const DEFAULT_DEEP_MODEL = 'claude-sonnet-5-5';
const ROLES = ['research', 'critic', 'analyst', 'writer'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function textResponse(body, type) {
  return new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' } });
}

function cleanText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function safeWebUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

function shortSearchQuery(query) {
  const stopwords = new Set(['jaké', 'jake', 'jsou', 'hlavní', 'hlavni', 'proč', 'proc', 'které', 'ktere', 'současné', 'soucasne', 'poznatky', 'dopady', 'příčiny', 'priciny', 'evropě', 'evrope', 'lidské', 'lidske', 'zdraví', 'zdravi', 'what', 'which', 'about', 'main', 'causes', 'effects', 'europe']);
  const words = query.toLowerCase().match(/[\p{L}]{4,}/gu) || [];
  return words.filter(word => !stopwords.has(word)).sort((a, b) => b.length - a.length)[0] || words[0] || query;
}

function parseObject(content) {
  const raw = content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim();
  try { return JSON.parse(raw); } catch { /* model may add a code fence */ }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch { /* keep raw */ }
  }
  return { raw };
}

function extractText(content) {
  return content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim();
}

function trimForModel(value, max = 19000) {
  return JSON.stringify(value).slice(0, max);
}

async function readBody(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 12000) throw new Error('Požadavek je příliš dlouhý.');
  const body = await request.text();
  if (body.length > 12000) throw new Error('Požadavek je příliš dlouhý.');
  try { return JSON.parse(body); } catch { throw new Error('Neplatný JSON požadavek.'); }
}

async function callClaude(fetchImpl, apiKey, model, system, messages, extra = {}) {
  const response = await fetchImpl(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2026-10-21',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ model, max_tokens: 1200, system, messages, ...extra }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Claude API: ${detail}`);
  }
  if (!Array.isArray(body.content)) throw new Error('Claude API vrátilo nečekaný formát.');
  return body;
}

async function searchSources(fetchImpl, query, perplexityKey) {
  const q = cleanText(query).slice(0, 180);
  if (!q) throw new Error('Vyhledávací dotaz je prázdný.');
  if (perplexityKey) {
    const response = await fetchImpl('https://api.perplexity.ai/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${perplexityKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, max_results: 8 }),
    });
    if (!response.ok) throw new Error(`Perplexity Search API: HTTP ${response.status}`);
    const data = await response.json();
    const unique = [...new Map((data.results || []).map(item => ({
      title: cleanText(item.title), url: safeWebUrl(item.url),
      snippet: cleanText(item.snippet).slice(0, 1800),
      date: item.date || item.last_updated || null, provider: 'Perplexity Search',
    })).filter(item => item.url).map(item => [item.url, item])).values()].slice(0, 8);
    if (!unique.length) throw new Error('Perplexity Search API nevrátilo použitelné zdroje.');
    return { query: q, sources: unique.map((source, index) => ({ id: `S${index + 1}`, ...source })), provider_errors: [] };
  }
  const providers = [];
  for (const [lang, searchQuery] of [['cs', shortSearchQuery(q)], ['en', q]]) {
    providers.push((async () => {
      const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srlimit=4&format=json&origin=*`;
      const response = await fetchImpl(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'MultiAgentResearchAssistant/1.0' } });
      if (!response.ok) throw new Error(`Wikipedia (${lang}) HTTP ${response.status}`);
      const data = await response.json();
      return (data.query?.search || []).map(item => ({
        title: cleanText(item.title),
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`,
        snippet: cleanText(item.snippet), date: item.timestamp || null, provider: `Wikipedia (${lang})`,
      }));
    })());
  }
  providers.push((async () => {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=4&select=id,display_name,publication_year,primary_location,doi`;
    const response = await fetchImpl(url, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`OpenAlex HTTP ${response.status}`);
    const data = await response.json();
    return (data.results || []).map(item => ({
      title: cleanText(item.display_name), url: item.doi || item.id,
      snippet: cleanText(item.primary_location?.source?.display_name || 'Bibliografický záznam; plný text nebyl otevřen.'),
      date: item.publication_year || null, provider: 'OpenAlex',
    }));
  })());
  const settled = await Promise.allSettled(providers);
  const sources = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const errors = settled.filter(result => result.status === 'rejected').map(result => String(result.reason?.message || result.reason));
  const unique = [...new Map(sources.map(source => ({ ...source, url: safeWebUrl(source.url) })).filter(source => source.url).map(source => [source.url, source])).values()].slice(0, 10);
  if (!unique.length) throw new Error(`Vyhledávání nevrátilo zdroje. ${errors.join('; ')}`);
  return { query: q, sources: unique.map((source, index) => ({ id: `S${index + 1}`, ...source })), provider_errors: errors };
}

function streamRun(request, env, fetchImpl, input) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = async (type, data) => {
    await writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
  };
  const topic = input.topic.trim();
  const demo = Boolean(input.demo);
  const models = { fast: env.CLAUDE_FAST_MODEL || DEFAULT_FAST_MODEL, deep: env.CLAUDE_DEEP_MODEL || DEFAULT_DEEP_MODEL };
  const key = input.apiKey?.trim() || env.ANTHROPIC_API_KEY;
  const perplexityKey = env.PERPLEXITY_API_KEY;
  void (async () => {
    try {
      await emit('run_start', { topic, roles: ROLES, mode: demo ? 'demo' : 'api', models: demo ? null : models });
      if (demo) await runDemo(fetchImpl, topic, perplexityKey, emit);
      else await runReal(fetchImpl, key, models, topic, perplexityKey, emit);
      await emit('run_done', { ok: true });
    } catch (error) {
      await emit('run_error', { message: error.message || String(error) }).catch(() => {});
    } finally {
      await writer.close().catch(() => {});
    }
  })();
  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function runReal(fetchImpl, apiKey, models, topic, perplexityKey, emit) {
  // 1. Research: Claude musí vyvolat klientský nástroj search_sources.
  await emit('agent_start', { agent: 'research', step: 'Volím dotaz a spouštím vyhledávací nástroj.' });
  const searchTool = {
    name: 'search_sources',
    description: 'Vyhledá externí zdroje přes Perplexity Search API; bez jeho klíče použije Wikipedii a OpenAlex. Vrať krátký konkrétní dotaz.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  };
  const researchSystem = 'Jsi výzkumný agent. Nejprve POVINNĚ použij search_sources. Pak vytvoř stručný JSON objekt s poli summary, findings (pole tvrzení se source_ids) a open_questions. Nezaměňuj úryvek vyhledávání za přečtený článek. Odpovídej česky.';
  const researchMessages = [{ role: 'user', content: `Téma/otázka: ${topic}` }];
  const toolResponse = await callClaude(fetchImpl, apiKey, models.fast, researchSystem, researchMessages, {
    tools: [searchTool], tool_choice: { type: 'tool', name: 'search_sources', disable_parallel_tool_use: true }, max_tokens: 500,
  });
  const toolUse = toolResponse.content.find(block => block.type === 'tool_use' && block.name === 'search_sources');
  if (!toolUse) throw new Error('Výzkumný agent nevyvolal povinný nástroj search_sources.');
  const query = cleanText(toolUse.input?.query || topic);
  await emit('tool_call', { agent: 'research', tool: 'search_sources', input: { query } });
  const search = await searchSources(fetchImpl, query, perplexityKey);
  await emit('tool_result', { agent: 'research', tool: 'search_sources', result: search });
  researchMessages.push({ role: 'assistant', content: toolResponse.content });
  researchMessages.push({ role: 'user', content: toolResponse.content.filter(block => block.type === 'tool_use').map(block => ({
    type: 'tool_result', tool_use_id: block.id, content: trimForModel(search),
  })) });
  const researchResponse = await callClaude(fetchImpl, apiKey, models.fast, researchSystem, researchMessages, { max_tokens: 1100 });
  const research = parseObject(researchResponse.content);
  await emit('agent_output', { agent: 'research', output: research });
  await emit('handoff', { from: 'research', to: 'critic', payload: { research, sources: search.sources } });

  // 2. Critic: projektový Skill je vložen do system promptu tohoto agenta.
  await emit('agent_start', { agent: 'critic', step: 'Používám Skill source-evaluation na zdroje a tvrzení.' });
  await emit('skill_loaded', { agent: 'critic', skill: 'source-evaluation', path: '.cursor/skills/source-evaluation/SKILL.md' });
  const criticResponse = await callClaude(fetchImpl, apiKey, models.fast,
    `Jsi nezávislý hodnotitel zdrojů. Dodrž následující projektový Skill. Vrať výhradně JSON.\n\n${SOURCE_SKILL}`,
    [{ role: 'user', content: `Otázka: ${topic}\nPředané zdroje a výzkumný výstup: ${trimForModel({ sources: search.sources, research })}` }],
    { max_tokens: 1300 });
  const evaluation = parseObject(criticResponse.content);
  await emit('agent_output', { agent: 'critic', output: evaluation });
  await emit('handoff', { from: 'critic', to: 'analyst', payload: { research, evaluation, sources: search.sources } });

  // 3. Analyst: dostane explicitně oba předchozí artefakty.
  await emit('agent_start', { agent: 'analyst', step: 'Syntetizuji pouze podložená tvrzení a mezery.' });
  const analystResponse = await callClaude(fetchImpl, apiKey, models.deep,
    'Jsi analytik. Použij předaný výzkum a hodnocení zdrojů. Vrať pouze JSON s poli key_points (text, source_ids), tensions, limitations, conclusion. Nepřidávej nepodložené fakty. Odpovídej česky.',
    [{ role: 'user', content: `Otázka: ${topic}\nHandoff: ${trimForModel({ research, evaluation, sources: search.sources })}` }],
    { max_tokens: 1300 });
  const analysis = parseObject(analystResponse.content);
  await emit('agent_output', { agent: 'analyst', output: analysis });
  await emit('handoff', { from: 'analyst', to: 'writer', payload: { analysis, evaluation, sources: search.sources } });

  // 4. Writer: strukturovaný report s odkazy na existující ID zdrojů.
  await emit('agent_start', { agent: 'writer', step: 'Píšu závěrečnou odpověď s citacemi a limity.' });
  const writerResponse = await callClaude(fetchImpl, apiKey, models.deep,
    'Jsi autor závěrečné zprávy. Napiš česky přehledný Markdown: krátká odpověď, hlavní zjištění, nejistoty/omezení, zdroje. Každé faktické tvrzení opatři ID zdroje ve tvaru [S1]. Použij jen předaná ID a URL. Nezakrývej chybějící důkazy.',
    [{ role: 'user', content: `Otázka: ${topic}\nHandoff: ${trimForModel({ analysis, evaluation, sources: search.sources })}` }],
    { max_tokens: 1700 });
  await emit('agent_output', { agent: 'writer', output: extractText(writerResponse.content) });
}

async function runDemo(fetchImpl, topic, perplexityKey, emit) {
  await emit('agent_start', { agent: 'research', step: 'Ukázkový režim: hledám reálné zdroje.' });
  await emit('tool_call', { agent: 'research', tool: 'search_sources', input: { query: topic } });
  const search = await searchSources(fetchImpl, topic, perplexityKey);
  await emit('tool_result', { agent: 'research', tool: 'search_sources', result: search });
  const research = { summary: `Nalezeno ${search.sources.length} zdrojů k tématu „${topic}“.`, findings: search.sources.slice(0, 3).map(source => ({ claim: source.title, source_ids: [source.id] })), open_questions: ['Ověřit obsah plných textů.'] };
  await emit('agent_output', { agent: 'research', output: research });
  await emit('handoff', { from: 'research', to: 'critic', payload: { research, sources: search.sources } });
  await emit('agent_start', { agent: 'critic', step: 'Ukázkový režim: hodnotím dostupnost důkazů.' });
  await emit('skill_loaded', { agent: 'critic', skill: 'source-evaluation', path: '.cursor/skills/source-evaluation/SKILL.md' });
  const evaluation = { sources: search.sources.map(source => ({ id: source.id, snippet_only: true, reason: 'Dostupný je pouze výsledek vyhledávání.' })), claims: [], gaps: ['Otevřít a ověřit plné texty.'], overall_confidence: 'low' };
  await emit('agent_output', { agent: 'critic', output: evaluation });
  await emit('handoff', { from: 'critic', to: 'analyst', payload: { research, evaluation, sources: search.sources } });
  await emit('agent_start', { agent: 'analyst', step: 'Ukázkový režim: skládám orientační přehled.' });
  const analysis = { key_points: research.findings, limitations: evaluation.gaps, conclusion: 'Dostupné úryvky nestačí k věcnému závěru.' };
  await emit('agent_output', { agent: 'analyst', output: analysis });
  await emit('handoff', { from: 'analyst', to: 'writer', payload: { analysis, evaluation, sources: search.sources } });
  await emit('agent_start', { agent: 'writer', step: 'Ukázkový režim: formátuji přehled.' });
  const report = `# ${topic}\n\nToto je ukázkový režim bez AI API. Vyhledávání zdrojů je skutečné; závěry jsou pouze demonstrací toku dat.\n\n## Nalezené zdroje\n${search.sources.map(source => `- [${source.id}] ${source.title} — ${source.url}`).join('\n')}\n\n## Další krok\nSpusťte režim s Claude API klíčem pro skutečný výzkum, hodnocení a syntézu.`;
  await emit('agent_output', { agent: 'writer', output: report });
}

export function createApp(fetchImpl = fetch) {
  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/') return textResponse(HTML, 'text/html');
      if (request.method === 'GET' && url.pathname === '/styles.css') return textResponse(CSS, 'text/css');
      if (request.method === 'GET' && url.pathname === '/app.js') return textResponse(JS, 'text/javascript');
      if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, roles: ROLES, skill: 'source-evaluation', models: { fast: env.CLAUDE_FAST_MODEL || DEFAULT_FAST_MODEL, deep: env.CLAUDE_DEEP_MODEL || DEFAULT_DEEP_MODEL }, search: env.PERPLEXITY_API_KEY ? 'Perplexity Search' : 'Wikipedia + OpenAlex' });
      if (request.method === 'POST' && url.pathname === '/api/run') {
        try {
          const input = await readBody(request);
          if (typeof input.topic !== 'string' || input.topic.trim().length < 5 || input.topic.length > 500) return json({ error: 'Téma musí mít 5–500 znaků.' }, 400);
          if (!input.demo && !(input.apiKey?.trim() || env.ANTHROPIC_API_KEY)) return json({ error: 'Zadejte Claude API klíč nebo spusťte ukázkový režim.' }, 400);
          return streamRun(request, env, fetchImpl, input);
        } catch (error) { return json({ error: error.message }, 400); }
      }
      return json({ error: 'Nenalezeno.' }, 404);
    },
  };
}

export default createApp();
