import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { encoding: 'utf8' });
assert.equal(build.status, 0, build.stderr);
const { createApp } = await import(pathToFileURL(path.join(root, 'dist', 'server', 'index.js')));

function response(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
function eventsFrom(text) {
  return text.trim().split('\n\n').map(frame => ({
    type: frame.match(/^event: (.+)$/m)?.[1],
    data: JSON.parse(frame.match(/^data: (.+)$/m)?.[1] || '{}'),
  }));
}

test('pipeline volá skutečný nástroj, používá Skill a předává artefakty mezi agenty', async () => {
  const apiBodies = [];
  const mockFetch = async (url, options = {}) => {
    if (String(url).includes('api.anthropic.com')) {
      const body = JSON.parse(options.body); apiBodies.push(body);
      if (apiBodies.length === 1) return response({ content: [{ type: 'tool_use', id: 'toolu_1', name: 'search_sources', input: { query: 'test energie' } }] });
      if (apiBodies.length === 2) return response({ content: [{ type: 'text', text: JSON.stringify({ summary: 'Shrnutí R', findings: [{ claim: 'Tvrzení R', source_ids: ['S1'] }] }) }] });
      if (apiBodies.length === 3) return response({ content: [{ type: 'text', text: JSON.stringify({ sources: [{ id: 'S1', snippet_only: true }], overall_confidence: 'low' }) }] });
      if (apiBodies.length === 4) return response({ content: [{ type: 'text', text: JSON.stringify({ key_points: [{ text: 'Závěr A', source_ids: ['S1'] }] }) }] });
      return response({ content: [{ type: 'text', text: '# Zpráva\nZávěr A [S1]' }] });
    }
    if (String(url).includes('wikipedia.org')) return response({ query: { search: [{ title: 'Energie', snippet: 'Zdroj', timestamp: '2026-01-01' }] } });
    if (String(url).includes('openalex.org')) return response({ results: [] });
    throw new Error(`Unexpected URL: ${url}`);
  };
  const app = createApp(mockFetch);
  const run = await app.fetch(new Request('http://local/api/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: 'Test energie', apiKey: 'test-key' }),
  }), {});
  assert.equal(run.status, 200);
  const events = eventsFrom(await run.text());
  assert.equal(apiBodies.length, 5);
  assert.deepEqual(apiBodies.map(body => body.model), [
    'claude-haiku-5-5', 'claude-haiku-5-5', 'claude-haiku-5-5',
    'claude-sonnet-5-5', 'claude-sonnet-5-5',
  ]);
  assert.deepEqual(events.filter(event => event.type === 'handoff').map(event => [event.data.from, event.data.to]), [
    ['research', 'critic'], ['critic', 'analyst'], ['analyst', 'writer'],
  ]);
  assert.equal(events.find(event => event.type === 'tool_result').data.result.sources[0].id, 'S1');
  assert.equal(events.find(event => event.type === 'skill_loaded').data.skill, 'source-evaluation');
  assert.match(apiBodies[2].system, /snippet_only/);
  assert.match(apiBodies[3].messages[0].content, /overall_confidence/);
  assert.match(apiBodies[4].messages[0].content, /Závěr A/);
  assert.equal(events.at(-1).type, 'run_done');
});

test('s Perplexity klíčem používá Search API a předává jeho zdroje Claude agentům', async () => {
  const calls = [];
  let claudeCalls = 0;
  const mockFetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url) === 'https://api.perplexity.ai/search') {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, 'Bearer test-perplexity-key');
      assert.deepEqual(JSON.parse(options.body), { query: 'obnovitelná energie', max_results: 8 });
      return response({ results: [{ title: 'Výroční zpráva', url: 'https://example.org/report', snippet: 'Údaje o energii', date: '2026-01-01' }] });
    }
    if (String(url) === 'https://api.anthropic.com/v1/messages') {
      claudeCalls += 1;
      if (claudeCalls === 1) return response({ content: [{ type: 'tool_use', id: 'toolu_1', name: 'search_sources', input: { query: 'obnovitelná energie' } }] });
      if (claudeCalls === 5) return response({ content: [{ type: 'text', text: 'Zpráva [S1]' }] });
      return response({ content: [{ type: 'text', text: JSON.stringify({ source_ids: ['S1'] }) }] });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const app = createApp(mockFetch);
  const run = await app.fetch(new Request('http://local/api/run', {
    method: 'POST', body: JSON.stringify({ topic: 'Obnovitelná energie' }),
  }), { ANTHROPIC_API_KEY: 'test-claude-key', PERPLEXITY_API_KEY: 'test-perplexity-key' });
  const events = eventsFrom(await run.text());
  assert.equal(calls.filter(url => url === 'https://api.perplexity.ai/search').length, 1);
  assert.equal(calls.length, 6);
  assert.equal(events.find(event => event.type === 'tool_result').data.result.sources[0].provider, 'Perplexity Search');
  assert.equal(events.filter(event => event.type === 'handoff').length, 3);
  assert.equal(events.at(-1).type, 'run_done');
});

test('bez klíče vrací srozumitelnou chybu', async () => {
  const app = createApp(async () => { throw new Error('Network must not be called'); });
  const run = await app.fetch(new Request('http://local/api/run', { method: 'POST', body: JSON.stringify({ topic: 'Dostatečně dlouhá otázka' }) }), {});
  assert.equal(run.status, 400);
  assert.match((await run.json()).error, /Claude API klíč/);
});

test('český dotaz dokončí demo i při omezení OpenAlex', async () => {
  const mockFetch = async url => {
    if (String(url).includes('cs.wikipedia.org')) return response({ query: { search: [{ title: 'Opylovač', snippet: 'Opylovač je živočich.' }] } });
    if (String(url).includes('en.wikipedia.org')) return response({ query: { search: [] } });
    if (String(url).includes('openalex.org')) return response({ error: 'rate limit' }, 429);
    throw new Error(`Unexpected URL: ${url}`);
  };
  const app = createApp(mockFetch);
  const run = await app.fetch(new Request('http://local/api/run', {
    method: 'POST', body: JSON.stringify({ topic: 'Jaké jsou hlavní příčiny úbytku opylovačů v Evropě?', demo: true }),
  }), {});
  const events = eventsFrom(await run.text());
  assert.equal(events.find(event => event.type === 'tool_result').data.result.sources[0].provider, 'Wikipedia (cs)');
  assert.equal(events.filter(event => event.type === 'handoff').length, 3);
  assert.equal(events.at(-1).type, 'run_done');
});
