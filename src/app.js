const form = document.querySelector('#research-form');
const topicInput = document.querySelector('#topic');
const submit = document.querySelector('#submit');
const errorBox = document.querySelector('#form-error');
const status = document.querySelector('#run-status');
const timeline = document.querySelector('#timeline');
const sources = document.querySelector('#sources');
const report = document.querySelector('#report');
const download = document.querySelector('#download');
let count = 0;
let reportText = '';
const pendingCalls = new Map();

document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  topicInput.value = button.dataset.example;
  topicInput.focus();
}));
function agentCard(name) { return document.querySelector(`[data-agent="${name}"]`); }
function label(name) { return ({ research: 'Výzkumník', critic: 'Hodnotitel', analyst: 'Analytik', writer: 'Autor' })[name] || name; }
function setStatus(text, kind = '') { status.textContent = text; status.className = `status-pill ${kind}`.trim(); }
function reset() {
  count = 0; reportText = '';
  pendingCalls.clear();
  timeline.replaceChildren(); sources.replaceChildren();
  report.textContent = 'Zpráva se objeví po dokončení práce všech čtyř agentů.';
  report.classList.add('empty-report');
  download.disabled = true;
  document.querySelector('#event-count').textContent = '0 událostí';
  document.querySelector('#source-count').textContent = '0 zdrojů';
  document.querySelectorAll('.agent-card').forEach(card => {
    card.classList.remove('active', 'done');
    card.querySelector('.agent-state').textContent = 'Čeká';
    card.querySelector('.agent-step').textContent = 'Čeká na vstup';
    card.querySelector('.agent-output').textContent = '';
    card.querySelector('.call-list').replaceChildren();
    card.querySelectorAll('details').forEach(details => { details.open = false; });
  });
}
function showCallRequest(data) {
  const list = agentCard(data.agent).querySelector('.call-list');
  const item = document.createElement('details'); item.className = 'call-item';
  const title = document.createElement('summary'); title.textContent = `${data.phase} · ${data.request.model} · čeká`;
  const request = document.createElement('pre'); request.textContent = `REQUEST\n${JSON.stringify(data.request, null, 2)}`;
  const answer = document.createElement('pre'); answer.textContent = 'RESPONSE\nČeká na model…';
  item.append(title, request, answer); list.append(item);
  pendingCalls.set(data.agent, { title, answer, phase: data.phase });
  addEvent('LLM', `${label(data.agent)}: ${data.phase} (${data.request.model}).`);
}
function showCallResponse(data) {
  const pending = pendingCalls.get(data.agent);
  if (!pending) return;
  pending.title.textContent = `${pending.phase} · ${data.stop_reason}`;
  pending.answer.textContent = `RESPONSE · stop_reason: ${data.stop_reason}\n${JSON.stringify(data.content, null, 2)}`;
  pendingCalls.delete(data.agent);
  addEvent('LLM', `${label(data.agent)}: stop_reason ${data.stop_reason}.`);
}
function addEvent(kind, message) {
  const li = document.createElement('li');
  const time = document.createElement('span'); time.className = 'time'; time.textContent = new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const content = document.createElement('span');
  const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = kind;
  content.append(tag, document.createTextNode(`  ${message}`));
  li.append(time, content); timeline.append(li);
  timeline.scrollTop = timeline.scrollHeight;
  count += 1; document.querySelector('#event-count').textContent = `${count} událostí`;
}
function renderSources(items) {
  sources.replaceChildren();
  for (const item of items) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const id = document.createElement('span'); id.className = 'source-id'; id.textContent = `[${item.id}]`;
    link.append(id, document.createTextNode(item.title || item.url));
    const meta = document.createElement('div'); meta.className = 'source-meta'; meta.textContent = `${item.provider || 'Zdroj'}${item.date ? ` · ${item.date}` : ''}`;
    const snippet = document.createElement('div'); snippet.textContent = item.snippet || '';
    li.append(link, meta, snippet); sources.append(li);
  }
  document.querySelector('#source-count').textContent = `${items.length} zdrojů`;
}
function onEvent(type, data) {
  if (type === 'run_start') {
    setStatus('Claude API běží', 'active');
    addEvent('START', data.topic);
    if (data.models) addEvent('MODELY', `Výzkumník + hodnotitel: ${data.models.fast}; analytik + autor: ${data.models.deep}.`);
  }
  if (type === 'agent_start') {
    const card = agentCard(data.agent);
    card.classList.add('active'); card.classList.remove('done');
    card.querySelector('.agent-state').textContent = 'Pracuje';
    card.querySelector('.agent-step').textContent = data.step;
    addEvent(label(data.agent), data.step);
  }
  if (type === 'llm_request') showCallRequest(data);
  if (type === 'llm_response') showCallResponse(data);
  if (type === 'tool_call') addEvent('NÁSTROJ', `${label(data.agent)} volá ${data.tool}: „${data.input.query}“`);
  if (type === 'tool_result') {
    renderSources(data.result.sources || []);
    addEvent('NÁSTROJ', `${data.tool} přidal ${data.result.new_sources?.length ?? data.result.sources?.length ?? 0} zdrojů; celkem ${data.result.sources?.length || 0}${data.result.provider_errors?.length ? `; ${data.result.provider_errors.length} poskytovatel selhal` : ''}.`);
  }
  if (type === 'skill_loaded') addEvent('SKILL', `${label(data.agent)} používá ${data.path}`);
  if (type === 'skill_check') addEvent('SKILL', `Skript zkontroloval ${data.result.sources.length} zdrojů a ${data.result.claims.length} tvrzení.`);
  if (type === 'validation_ok') addEvent('KONTROLA', `${label(data.agent)}: výstup prošel validací.`);
  if (type === 'validation_error') addEvent('KONTROLA', `${label(data.agent)}: ${data.message}`);
  if (type === 'agent_output') {
    const card = agentCard(data.agent);
    card.classList.remove('active'); card.classList.add('done');
    card.querySelector('.agent-state').textContent = 'Hotovo';
    card.querySelector('.agent-step').textContent = 'Výstup připraven k předání';
    card.querySelector('.agent-output').textContent = typeof data.output === 'string' ? data.output : JSON.stringify(data.output, null, 2);
    addEvent(label(data.agent), 'Dokončil svůj výstup.');
    if (data.agent === 'writer') {
      reportText = typeof data.output === 'string' ? data.output : JSON.stringify(data.output, null, 2);
      report.textContent = reportText; report.classList.remove('empty-report'); download.disabled = false;
      report.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  if (type === 'handoff') addEvent('HANDOFF', `${label(data.from)} → ${label(data.to)}: předán výstup a zdroje.`);
  if (type === 'run_done') { setStatus('Dokončeno'); addEvent('HOTOVO', 'Celá pipeline je dokončená.'); }
  if (type === 'run_error') { setStatus('Chyba', 'error'); showError(data.message); addEvent('CHYBA', data.message); }
}
function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }

async function readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split); buffer = buffer.slice(split + 2);
      const type = frame.match(/^event: (.+)$/m)?.[1];
      const raw = frame.match(/^data: (.+)$/m)?.[1];
      if (type && raw) {
        onEvent(type, JSON.parse(raw));
        if (type === 'run_done' || type === 'run_error') finished = true;
      }
    }
    if (done) break;
  }
  if (!finished) throw new Error('Přenos výsledku skončil před dokončením výzkumu.');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  errorBox.hidden = true;
  reset();
  submit.disabled = true;
  submit.firstElementChild.textContent = 'Probíhá výzkum…';
  document.querySelector('#work-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const response = await fetch('/api/run', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: topicInput.value }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    await readEvents(response);
  } catch (error) {
    setStatus('Chyba', 'error'); showError(error.message); addEvent('CHYBA', error.message);
  } finally {
    submit.disabled = false; submit.firstElementChild.textContent = 'Spustit výzkum';
  }
});

download.addEventListener('click', () => {
  if (!reportText) return;
  const url = URL.createObjectURL(new Blob([reportText], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'vyzkumna-zprava.md'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
