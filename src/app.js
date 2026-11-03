const form = document.querySelector('#research-form');
const topicInput = document.querySelector('#topic');
const keyInput = document.querySelector('#api-key');
const demoInput = document.querySelector('#demo');
const keyWrap = document.querySelector('#key-wrap');
const submit = document.querySelector('#submit');
const errorBox = document.querySelector('#form-error');
const status = document.querySelector('#run-status');
const timeline = document.querySelector('#timeline');
const sources = document.querySelector('#sources');
const report = document.querySelector('#report');
const download = document.querySelector('#download');
let count = 0;
let reportText = '';

document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  topicInput.value = button.dataset.example;
  topicInput.focus();
}));
demoInput.addEventListener('change', () => {
  keyWrap.classList.toggle('hidden', demoInput.checked);
});

function agentCard(name) { return document.querySelector(`[data-agent="${name}"]`); }
function label(name) { return ({ research: 'Výzkumník', critic: 'Hodnotitel', analyst: 'Analytik', writer: 'Autor' })[name] || name; }
function setStatus(text, kind = '') { status.textContent = text; status.className = `status-pill ${kind}`.trim(); }
function reset() {
  count = 0; reportText = '';
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
    card.querySelector('details').open = false;
  });
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
    setStatus(data.mode === 'demo' ? 'Ukázkový běh' : 'Claude API běží', 'active');
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
  if (type === 'tool_call') addEvent('NÁSTROJ', `${label(data.agent)} volá ${data.tool}: „${data.input.query}“`);
  if (type === 'tool_result') {
    renderSources(data.result.sources || []);
    addEvent('NÁSTROJ', `${data.tool} vrátil ${data.result.sources?.length || 0} zdrojů${data.result.provider_errors?.length ? `; ${data.result.provider_errors.length} poskytovatel selhal` : ''}.`);
  }
  if (type === 'skill_loaded') addEvent('SKILL', `${label(data.agent)} používá ${data.path}`);
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
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split); buffer = buffer.slice(split + 2);
      const type = frame.match(/^event: (.+)$/m)?.[1];
      const raw = frame.match(/^data: (.+)$/m)?.[1];
      if (type && raw) onEvent(type, JSON.parse(raw));
    }
    if (done) break;
  }
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
      body: JSON.stringify({ topic: topicInput.value, apiKey: demoInput.checked ? '' : keyInput.value, demo: demoInput.checked }),
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
    keyInput.value = '';
  }
});

download.addEventListener('click', () => {
  if (!reportText) return;
  const url = URL.createObjectURL(new Blob([reportText], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'vyzkumna-zprava.md'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
