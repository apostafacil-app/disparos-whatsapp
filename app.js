/* ══════════════════════════════════════════
   DISPAROS WHATSAPP — app.js
   Integração: Supabase + uazapi
══════════════════════════════════════════ */

'use strict';

// ─── Supabase client ───────────────────────
let sb = null;

function initSupabase(url, key) {
  const { createClient } = supabase;
  sb = createClient(url, key);
}

// ─── Utilitários gerais ────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function $(id) { return document.getElementById(id); }

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function showEl(el) { el.style.display = ''; }
function hideEl(el) { el.style.display = 'none'; }

function flashMsg(id, text, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = isError ? 'error-msg' : 'success-msg';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

async function hashPassword(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Normaliza número para formato 55DDNNNNNNNNN
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Já tem código do país 55 e 13 dígitos
  if (digits.startsWith('55') && digits.length === 13) return digits;
  // 11 dígitos (DDD + 9 + número)
  if (digits.length === 11) return '55' + digits;
  // 10 dígitos (DDD + número sem 9) → adiciona 9 após DDD
  if (digits.length === 10) return '55' + digits.slice(0, 2) + '9' + digits.slice(2);
  // Já tem 55 + 12 dígitos (antigo)
  if (digits.startsWith('55') && digits.length === 12) return '55' + digits.slice(2, 4) + '9' + digits.slice(4);
  // Retorna como está se não encaixar
  return digits.length >= 10 ? '55' + digits.slice(-11) : null;
}

function parseContacts(text) {
  return text
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(normalizePhone)
    .filter(Boolean);
}

// ─── Gerador de ID simples ─────────────────
let stepCounter = 0;
function newId() { return `step_${++stepCounter}_${Date.now()}`; }

// ══════════════════════════════════════════
// AUTENTICAÇÃO
// ══════════════════════════════════════════

async function getConfig() {
  if (!sb) return null;
  const { data } = await sb.from('disparos_config').select('*').limit(1).maybeSingle();
  return data;
}

async function ensureConfig() {
  const cfg = await getConfig();
  if (!cfg) {
    const defaultHash = await hashPassword('admin123');
    await sb.from('disparos_config').insert({
      instance_url: '',
      api_token: '',
      senha_app: defaultHash
    });
    return await getConfig();
  }
  return cfg;
}

async function checkLogin(password) {
  const cfg = await ensureConfig();
  if (!cfg) throw new Error('Não foi possível conectar ao banco.');
  const hash = await hashPassword(password);
  return hash === cfg.senha_app;
}

function isLoggedIn() {
  return sessionStorage.getItem('disparos_auth') === 'ok';
}

function setLoggedIn() {
  sessionStorage.setItem('disparos_auth', 'ok');
}

function logout() {
  sessionStorage.removeItem('disparos_auth');
  location.reload();
}

// ══════════════════════════════════════════
// TELAS / NAVEGAÇÃO
// ══════════════════════════════════════════

async function resolveInitialScreen() {
  const sbUrl = localStorage.getItem('sb_url');
  const sbKey = localStorage.getItem('sb_key');

  if (!sbUrl || !sbKey) {
    show('screen-setup');
    return;
  }

  try {
    initSupabase(sbUrl, sbKey);
  } catch {
    show('screen-setup');
    return;
  }

  if (!isLoggedIn()) {
    show('screen-login');
    return;
  }

  await loadApp();
}

async function loadApp() {
  show('screen-app');
  await Promise.all([
    loadListasSelect(),
    loadTemplatesSelect(),
    loadConfigFields(),
    loadListas(),
    loadTemplates(),
    loadHistorico()
  ]);
}

// ══════════════════════════════════════════
// TABS
// ══════════════════════════════════════════

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ══════════════════════════════════════════
// MESSAGE STEPS
// ══════════════════════════════════════════

const stepsData = {}; // id → { type, content, caption, filename, dataUrl }

function createStepEl(containerId, id, defaultType = 'text') {
  stepsData[id] = { id, type: defaultType, content: '', caption: '', filename: '', dataUrl: '' };

  const el = document.createElement('div');
  el.className = 'step-item';
  el.dataset.id = id;
  el.innerHTML = buildStepHTML(id, defaultType);

  const container = $(containerId);
  if (!container.querySelector('.steps-container')) {
    container.innerHTML = '<div class="steps-container"></div>';
  }
  container.querySelector('.steps-container').appendChild(el);

  bindStepEvents(el, id, containerId);
  return el;
}

function buildStepHTML(id, type) {
  const typeLabel = { text: '✏️ Texto', image: '🖼️ Imagem', audio: '🎵 Áudio', document: '📄 Documento' };
  return `
    <div class="step-header">
      <select class="step-type-sel">
        <option value="text"   ${type==='text'    ? 'selected':''}>✏️ Texto</option>
        <option value="image"  ${type==='image'   ? 'selected':''}>🖼️ Imagem</option>
        <option value="audio"  ${type==='audio'   ? 'selected':''}>🎵 Áudio</option>
        <option value="document" ${type==='document'?'selected':''}>📄 Documento</option>
      </select>
      <button class="btn-icon step-del" title="Remover bloco">✕</button>
    </div>
    <div class="step-body">
      ${buildStepBody(type, id)}
    </div>`;
}

function buildStepBody(type, id) {
  const d = stepsData[id] || {};
  switch (type) {
    case 'text':
      return `<textarea class="step-content" placeholder="Digite sua mensagem...&#10;&#10;Use *negrito*, _itálico_, ~tachado~">${d.content || ''}</textarea>`;
    case 'image':
      return `
        <div class="step-file-wrap">
          <label class="file-label">
            <input type="file" class="step-file" accept="image/*">
            📎 Selecionar imagem
          </label>
          <div class="file-preview ${d.dataUrl ? 'visible' : ''}">
            <img src="${d.dataUrl || ''}" alt="">
            <span class="file-preview-name">${d.filename || ''}</span>
          </div>
        </div>
        <input type="text" class="step-caption" placeholder="Legenda (opcional)" value="${d.caption || ''}">`;
    case 'audio':
      return `<input type="url" class="step-content" placeholder="URL do áudio (PTT) — ex: https://..." value="${d.content || ''}">`;
    case 'document':
      return `
        <div class="step-file-wrap">
          <label class="file-label">
            <input type="file" class="step-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt">
            📎 Selecionar arquivo
          </label>
          <div class="file-preview ${d.dataUrl ? 'visible' : ''}">
            <span class="wpp-bubble-doc-icon">📄</span>
            <span class="file-preview-name">${d.filename || ''}</span>
          </div>
        </div>
        <input type="text" class="step-fname" placeholder="Nome do arquivo (ex: proposta.pdf)" value="${d.filename || ''}">`;
    default:
      return '';
  }
}

function bindStepEvents(el, id, containerId) {
  // Deletar
  el.querySelector('.step-del').addEventListener('click', () => {
    el.remove();
    delete stepsData[id];
    updatePreview();
  });

  // Mudar tipo
  el.querySelector('.step-type-sel').addEventListener('change', e => {
    const newType = e.target.value;
    stepsData[id].type = newType;
    stepsData[id].content = '';
    stepsData[id].dataUrl = '';
    stepsData[id].filename = '';
    stepsData[id].caption = '';
    el.querySelector('.step-body').innerHTML = buildStepBody(newType, id);
    bindStepBodyEvents(el, id);
    updatePreview();
  });

  bindStepBodyEvents(el, id);
}

function bindStepBodyEvents(el, id) {
  const data = stepsData[id];

  // Texto / URL de áudio
  const content = el.querySelector('.step-content');
  if (content) {
    content.addEventListener('input', e => {
      data.content = e.target.value;
      updatePreview();
    });
  }

  // Legenda de imagem
  const caption = el.querySelector('.step-caption');
  if (caption) {
    caption.addEventListener('input', e => {
      data.caption = e.target.value;
      updatePreview();
    });
  }

  // Nome de arquivo de documento
  const fname = el.querySelector('.step-fname');
  if (fname) {
    fname.addEventListener('input', e => {
      data.filename = e.target.value;
      updatePreview();
    });
  }

  // Upload de arquivo
  const fileInput = el.querySelector('.step-file');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = ev => {
        data.dataUrl = ev.target.result;
        data.filename = data.filename || file.name;

        const preview = el.querySelector('.file-preview');
        if (preview) {
          preview.classList.add('visible');
          const img = preview.querySelector('img');
          if (img) img.src = data.dataUrl;
          const nameEl = preview.querySelector('.file-preview-name');
          if (nameEl) nameEl.textContent = file.name;
        }

        // Atualiza campo de nome se documento
        const fnameField = el.querySelector('.step-fname');
        if (fnameField && !fnameField.value) fnameField.value = file.name;

        updatePreview();
      };
      reader.readAsDataURL(file);
    });
  }
}

function addStep(containerId) {
  const id = newId();
  createStepEl(containerId, id, 'text');
  updatePreview();
}

function getStepsFromContainer(containerId) {
  const container = $(containerId);
  const items = container.querySelectorAll('.step-item');
  return Array.from(items).map(el => stepsData[el.dataset.id]).filter(Boolean);
}

function loadStepsIntoContainer(containerId, steps) {
  const container = $(containerId);
  container.innerHTML = '';

  if (!steps || !steps.length) return;

  steps.forEach(step => {
    const id = newId();
    stepsData[id] = { ...step, id };
    const el = document.createElement('div');
    el.className = 'step-item';
    el.dataset.id = id;
    el.innerHTML = buildStepHTML(id, step.type);
    if (!container.querySelector('.steps-container')) {
      container.innerHTML = '<div class="steps-container"></div>';
    }
    container.querySelector('.steps-container').appendChild(el);
    bindStepEvents(el, id, containerId);
  });

  updatePreview();
}

// ══════════════════════════════════════════
// WHATSAPP PREVIEW
// ══════════════════════════════════════════

function updatePreview() {
  const body = $('wpp-body');
  const steps = getStepsFromContainer('steps-list');

  if (!steps.length) {
    body.innerHTML = '<div class="wpp-empty">Adicione blocos para ver o preview</div>';
    return;
  }

  const now = formatTime();
  body.innerHTML = steps.map(s => buildBubble(s, now)).join('');
  body.scrollTop = body.scrollHeight;
}

function buildBubble(step, time) {
  let inner = '';
  switch (step.type) {
    case 'text':
      inner = `<div>${(step.content || '').replace(/\n/g, '<br>') || '<em style="opacity:.5">Mensagem vazia</em>'}</div>`;
      break;
    case 'image':
      inner = step.dataUrl
        ? `<img class="wpp-bubble-img" src="${step.dataUrl}" alt="imagem">` +
          (step.caption ? `<div>${step.caption}</div>` : '')
        : `<div style="opacity:.5">🖼️ Imagem selecionada</div>`;
      break;
    case 'audio':
      inner = `<div class="wpp-bubble-audio"><span>🎵</span> Mensagem de voz${step.content ? '' : ' <em style="opacity:.5">(sem URL)</em>'}</div>`;
      break;
    case 'document':
      inner = `<div class="wpp-bubble-doc"><span class="wpp-bubble-doc-icon">📄</span>${step.filename || 'documento'}</div>`;
      break;
  }
  return `<div class="wpp-bubble">${inner}<div class="wpp-bubble-time">${time} ✓✓</div></div>`;
}

// ══════════════════════════════════════════
// CONTATOS
// ══════════════════════════════════════════

let loadedContacts = [];

function loadContacts() {
  const text = $('contacts-input').value;
  loadedContacts = parseContacts(text);
  $('contacts-count').textContent = `${loadedContacts.length} contato${loadedContacts.length !== 1 ? 's' : ''}`;
}

// ══════════════════════════════════════════
// LISTAS — CRUD
// ══════════════════════════════════════════

async function saveLista() {
  const nome = $('lista-nome').value.trim();
  const numeros = $('lista-numeros').value.trim();
  if (!nome || !numeros) { flashMsg('lista-msg', 'Preencha nome e números.', true); return; }

  const parsed = parseContacts(numeros);
  await sb.from('disparos_listas').insert({
    nome,
    numeros: JSON.stringify(parsed)
  });

  flashMsg('lista-msg', `Lista "${nome}" salva com ${parsed.length} contatos!`);
  $('lista-nome').value = '';
  $('lista-numeros').value = '';
  await loadListas();
  await loadListasSelect();
}

async function deleteLista(id) {
  if (!confirm('Excluir esta lista?')) return;
  await sb.from('disparos_listas').delete().eq('id', id);
  await loadListas();
  await loadListasSelect();
}

async function loadListas() {
  const { data } = await sb.from('disparos_listas').select('*').order('created_at', { ascending: false });
  const container = $('listas-list');

  if (!data || !data.length) {
    container.innerHTML = '<div class="empty-state">Nenhuma lista salva</div>';
    return;
  }

  container.innerHTML = data.map(l => {
    const count = JSON.parse(l.numeros || '[]').length;
    return `<div class="item-row">
      <div class="item-info">
        <div class="item-name">${l.nome}</div>
        <div class="item-meta">${count} contatos · ${formatDate(l.created_at)}</div>
      </div>
      <div class="item-actions">
        <button class="btn-secondary btn-sm" onclick="carregarListaEmDisparos('${l.id}')">Usar</button>
        <button class="btn-icon" onclick="deleteLista('${l.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

async function loadListasSelect() {
  const { data } = await sb.from('disparos_listas').select('id, nome').order('nome');
  const sel = $('lista-select');
  sel.innerHTML = '<option value="">Carregar lista salva...</option>';
  (data || []).forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.nome;
    sel.appendChild(opt);
  });
}

async function carregarListaEmDisparos(id) {
  const { data } = await sb.from('disparos_listas').select('numeros').eq('id', id).single();
  if (!data) return;
  const nums = JSON.parse(data.numeros || '[]');
  $('contacts-input').value = nums.join('\n');
  loadContacts();
  // Navegar para aba Disparos
  document.querySelector('[data-tab="disparos"]').click();
}

// ══════════════════════════════════════════
// TEMPLATES — CRUD
// ══════════════════════════════════════════

async function saveTemplate(nome, steps) {
  if (!nome || !steps.length) return false;
  // Não salvar dataUrl (base64 grande) no banco — salvar referência
  const cleanSteps = steps.map(s => ({
    type: s.type,
    content: s.content || '',
    caption: s.caption || '',
    filename: s.filename || '',
    dataUrl: s.dataUrl || '' // mantemos para uso local
  }));
  await sb.from('disparos_templates').insert({ nome, steps: cleanSteps });
  return true;
}

async function deleteTemplate(id) {
  if (!confirm('Excluir este template?')) return;
  await sb.from('disparos_templates').delete().eq('id', id);
  await loadTemplates();
  await loadTemplatesSelect();
}

async function loadTemplates() {
  const { data } = await sb.from('disparos_templates').select('*').order('created_at', { ascending: false });
  const container = $('templates-list');

  if (!data || !data.length) {
    container.innerHTML = '<div class="empty-state">Nenhum template salvo</div>';
    return;
  }

  container.innerHTML = data.map(t => {
    const steps = t.steps || [];
    return `<div class="item-row">
      <div class="item-info">
        <div class="item-name">${t.nome}</div>
        <div class="item-meta">${steps.length} bloco(s) · ${formatDate(t.created_at)}</div>
      </div>
      <div class="item-actions">
        <button class="btn-secondary btn-sm" onclick="carregarTemplateEmDisparos('${t.id}')">Usar</button>
        <button class="btn-icon" onclick="deleteTemplate('${t.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

async function loadTemplatesSelect() {
  const { data } = await sb.from('disparos_templates').select('id, nome').order('nome');
  const sel = $('template-select');
  sel.innerHTML = '<option value="">Carregar template...</option>';
  (data || []).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.nome;
    sel.appendChild(opt);
  });
}

async function carregarTemplateEmDisparos(id) {
  const { data } = await sb.from('disparos_templates').select('steps').eq('id', id).single();
  if (!data) return;
  loadStepsIntoContainer('steps-list', data.steps || []);
  document.querySelector('[data-tab="disparos"]').click();
}

// ══════════════════════════════════════════
// HISTÓRICO
// ══════════════════════════════════════════

async function saveHistorico(entry) {
  await sb.from('disparos_historico').insert(entry);
}

async function loadHistorico() {
  const { data } = await sb.from('disparos_historico').select('*').order('created_at', { ascending: false }).limit(50);
  const container = $('historico-list');

  if (!data || !data.length) {
    container.innerHTML = '<div class="empty-state">Nenhuma campanha registrada</div>';
    return;
  }

  const statusLabel = { concluido: 'Concluído', parado: 'Parado', em_andamento: 'Em andamento' };
  const statusBadge = { concluido: 'badge-green', parado: 'badge-red', em_andamento: 'badge-purple' };
  const statusIcon  = { concluido: '✅', parado: '🛑', em_andamento: '🔄' };

  container.innerHTML = data.map(h => `
    <div class="hist-row">
      <div class="hist-icon">${statusIcon[h.status] || '📋'}</div>
      <div class="hist-info">
        <div class="hist-name">${h.nome || 'Campanha sem nome'}</div>
        <div class="hist-date">${formatDate(h.created_at)}</div>
      </div>
      <span class="badge ${statusBadge[h.status] || 'badge-purple'}">${statusLabel[h.status] || h.status}</span>
      <div class="hist-stat">
        <div class="hist-stat-num text-green">${h.enviados ?? 0}</div>
        <div class="hist-stat-label">enviados</div>
      </div>
      <div class="hist-stat">
        <div class="hist-stat-num text-red">${h.erros ?? 0}</div>
        <div class="hist-stat-label">erros</div>
      </div>
      <div class="hist-stat">
        <div class="hist-stat-num">${h.total ?? 0}</div>
        <div class="hist-stat-label">total</div>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════
// CONFIGURAÇÕES
// ══════════════════════════════════════════

async function loadConfigFields() {
  $('config-sb-url').value = localStorage.getItem('sb_url') || '';
  $('config-sb-key').value = localStorage.getItem('sb_key') || '';

  const cfg = await getConfig();
  if (cfg) {
    $('config-uazapi-url').value   = cfg.instance_url || '';
    $('config-uazapi-token').value = cfg.api_token    || '';
  }
}

async function saveUazapi() {
  const url   = $('config-uazapi-url').value.trim().replace(/\/$/, '');
  const token = $('config-uazapi-token').value.trim();
  if (!url || !token) { flashMsg('config-uazapi-msg', 'Preencha URL e token.', true); return; }

  const { error } = await sb.from('disparos_config').upsert({
    id: (await getConfig())?.id,
    instance_url: url,
    api_token: token
  }, { onConflict: 'id' });

  if (error) { flashMsg('config-uazapi-msg', 'Erro ao salvar: ' + error.message, true); return; }
  flashMsg('config-uazapi-msg', 'Configurações uazapi salvas!');
}

async function saveSenha() {
  const nova      = $('config-senha-nova').value;
  const confirmar = $('config-senha-confirmar').value;
  if (!nova) { flashMsg('config-senha-msg', 'Digite uma senha.', true); return; }
  if (nova !== confirmar) { flashMsg('config-senha-msg', 'Senhas não coincidem.', true); return; }
  if (nova.length < 6) { flashMsg('config-senha-msg', 'Senha mínima: 6 caracteres.', true); return; }

  const hash = await hashPassword(nova);
  const cfg = await getConfig();
  await sb.from('disparos_config').update({ senha_app: hash }).eq('id', cfg.id);
  flashMsg('config-senha-msg', 'Senha alterada com sucesso!');
  $('config-senha-nova').value = '';
  $('config-senha-confirmar').value = '';
}

// ══════════════════════════════════════════
// UAZAPI — ENVIO DE MENSAGENS
// ══════════════════════════════════════════

async function getUazapiCreds() {
  const cfg = await getConfig();
  if (!cfg?.instance_url || !cfg?.api_token) throw new Error('Configure URL e token do uazapi em Configurações.');
  return { baseUrl: cfg.instance_url.replace(/\/$/, ''), token: cfg.api_token };
}

async function sendStep(number, step) {
  const { baseUrl, token } = await getUazapiCreds();
  const headers = { 'Content-Type': 'application/json', 'token': token };

  let endpoint, body;

  switch (step.type) {
    case 'text':
      endpoint = `${baseUrl}/send-text`;
      body = { number, text: step.content };
      break;

    case 'image':
      endpoint = `${baseUrl}/send-image`;
      body = {
        number,
        image: step.dataUrl ? step.dataUrl.split(',')[1] : step.content, // base64 sem prefixo
        caption: step.caption || ''
      };
      break;

    case 'audio':
      endpoint = `${baseUrl}/send-audio`;
      body = { number, audio: step.content, ptt: true };
      break;

    case 'document':
      endpoint = `${baseUrl}/send-document`;
      body = {
        number,
        document: step.dataUrl ? step.dataUrl.split(',')[1] : '',
        filename: step.filename || 'arquivo'
      };
      break;

    default:
      throw new Error(`Tipo de step desconhecido: ${step.type}`);
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }

  return res.json().catch(() => ({}));
}

// ══════════════════════════════════════════
// CAMPAIGN ENGINE
// ══════════════════════════════════════════

const campaign = {
  running: false,
  paused: false,
  stopped: false,
  sentCount: 0,
  errorCount: 0,
  histId: null,
  log: []
};

function getParams() {
  const intervalSel = $('param-interval').value;
  const intervalMs = intervalSel === 'custom'
    ? (parseInt($('param-interval-custom').value) || 30) * 1000
    : parseInt(intervalSel);
  const pauseEvery    = parseInt($('param-pause-every').value)    || 0;
  const resumeAfterMs = parseInt($('param-resume-after').value)   || 60000;
  return { intervalMs, pauseEvery, resumeAfterMs };
}

function addLogLine(type, text) {
  const area = $('log-area');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-time">${formatTime()}</span><span class="log-${type}">${text}</span>`;
  area.appendChild(line);
  area.scrollTop = area.scrollHeight;
  campaign.log.push({ time: formatTime(), type, text });
}

function setStatus(text) {
  $('campaign-status').textContent = text;
}

function updateProgress(sent, total) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  $('progress-bar').style.width = `${pct}%`;
  $('progress-text').textContent = `${sent} / ${total} enviados`;
  $('error-count').textContent = campaign.errorCount > 0 ? `${campaign.errorCount} erro(s)` : '';
}

function setControlButtons(state) {
  // state: 'idle' | 'running' | 'paused'
  $('btn-start').disabled = state !== 'idle';
  $('btn-pause').disabled = state === 'idle';
  $('btn-stop').disabled  = state === 'idle';
  $('btn-pause').textContent = state === 'paused' ? '▶ Retomar' : '⏸ Pausar';
}

async function startCampaign() {
  const contacts = loadedContacts;
  const steps    = getStepsFromContainer('steps-list');

  if (!contacts.length) { alert('Carregue pelo menos um contato antes de iniciar.'); return; }
  if (!steps.length)    { alert('Adicione pelo menos um bloco de mensagem.'); return; }

  const { intervalMs, pauseEvery, resumeAfterMs } = getParams();

  campaign.running    = true;
  campaign.paused     = false;
  campaign.stopped    = false;
  campaign.sentCount  = 0;
  campaign.errorCount = 0;
  campaign.log        = [];

  showEl($('progress-section'));
  showEl($('log-section'));
  setControlButtons('running');
  updateProgress(0, contacts.length);
  setStatus('Iniciando campanha...');
  addLogLine('info', `Campanha iniciada — ${contacts.length} contatos, ${steps.length} bloco(s)`);

  // Salvar início no histórico
  const { data: histData } = await sb.from('disparos_historico').insert({
    nome: `Campanha ${formatDate(new Date().toISOString())}`,
    total: contacts.length,
    enviados: 0,
    erros: 0,
    status: 'em_andamento',
    log: []
  }).select().single();
  campaign.histId = histData?.id;

  try {
    for (let i = 0; i < contacts.length; i++) {
      if (campaign.stopped) break;

      // Aguardar se pausado
      while (campaign.paused && !campaign.stopped) {
        await sleep(300);
      }
      if (campaign.stopped) break;

      const contact = contacts[i];
      setStatus(`Enviando para ${contact}... (${i + 1}/${contacts.length})`);

      let contactOk = true;
      for (const step of steps) {
        if (campaign.stopped) break;
        try {
          await sendStep(contact, step);
          addLogLine('ok', `✓ ${contact} [${step.type}]`);
          await sleep(800); // pequeno delay entre blocos do mesmo contato
        } catch (e) {
          addLogLine('err', `✗ ${contact} [${step.type}]: ${e.message}`);
          campaign.errorCount++;
          contactOk = false;
        }
      }

      if (contactOk) campaign.sentCount++;
      updateProgress(campaign.sentCount, contacts.length);

      // Pausa programada
      if (pauseEvery > 0 && (i + 1) % pauseEvery === 0 && i + 1 < contacts.length) {
        addLogLine('info', `⏸ Pausa programada — aguardando ${resumeAfterMs / 1000}s`);
        await countdown(resumeAfterMs);
      } else if (i + 1 < contacts.length) {
        // Intervalo normal entre contatos
        await sleep(intervalMs);
      }
    }
  } catch (e) {
    addLogLine('err', `Erro crítico: ${e.message}`);
  }

  const finalStatus = campaign.stopped ? 'parado' : 'concluido';
  const finalMsg    = campaign.stopped ? '🛑 Campanha parada.' : '✅ Campanha concluída!';

  setStatus(finalMsg);
  addLogLine('info', `${finalMsg} Enviados: ${campaign.sentCount} | Erros: ${campaign.errorCount}`);
  setControlButtons('idle');
  campaign.running = false;

  // Atualizar histórico
  if (campaign.histId) {
    await sb.from('disparos_historico').update({
      enviados: campaign.sentCount,
      erros: campaign.errorCount,
      status: finalStatus,
      log: campaign.log
    }).eq('id', campaign.histId);
  }

  await loadHistorico();
}

async function countdown(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until && !campaign.stopped) {
    const remaining = Math.ceil((until - Date.now()) / 1000);
    setStatus(`⏸ Pausado. Retomando em ${remaining}s...`);
    await sleep(500);
  }
}

function togglePause() {
  if (!campaign.running) return;
  campaign.paused = !campaign.paused;
  if (campaign.paused) {
    setStatus('⏸ Pausado pelo usuário. Clique em Retomar para continuar.');
    setControlButtons('paused');
    addLogLine('info', '⏸ Pausado pelo usuário');
  } else {
    setStatus('▶ Retomando...');
    setControlButtons('running');
    addLogLine('info', '▶ Retomado pelo usuário');
  }
}

function stopCampaign() {
  if (!campaign.running) return;
  if (!confirm('Parar a campanha agora? O progresso atual será registrado.')) return;
  campaign.stopped = true;
  campaign.paused  = false;
  addLogLine('info', '🛑 Parada solicitada pelo usuário');
  setStatus('🛑 Parando...');
}

// ══════════════════════════════════════════
// MODAL — Salvar template a partir do composer
// ══════════════════════════════════════════

function openSaveTemplateModal() {
  $('modal-template-nome').value = '';
  $('modal-template').classList.remove('hidden');
  $('modal-template-nome').focus();
}

function closeSaveTemplateModal() {
  $('modal-template').classList.add('hidden');
}

async function confirmSaveTemplate() {
  const nome = $('modal-template-nome').value.trim();
  if (!nome) { $('modal-template-nome').focus(); return; }

  const steps = getStepsFromContainer('steps-list');
  const ok = await saveTemplate(nome, steps);
  if (ok) {
    closeSaveTemplateModal();
    await loadTemplates();
    await loadTemplatesSelect();
    addLogLine('info', `Template "${nome}" salvo`);
  }
}

// ══════════════════════════════════════════
// INIT — EVENT LISTENERS
// ══════════════════════════════════════════

function bindEvents() {
  // Setup
  $('btn-setup').addEventListener('click', async () => {
    const url = $('setup-url').value.trim();
    const key = $('setup-key').value.trim();
    if (!url || !key) { flashMsg('setup-error', 'Preencha URL e Anon Key.', true); return; }

    try {
      initSupabase(url, key);
      // Testar conexão
      await sb.from('disparos_config').select('id').limit(1);
      localStorage.setItem('sb_url', url);
      localStorage.setItem('sb_key', key);
      hide('screen-setup');
      show('screen-login');
    } catch (e) {
      flashMsg('setup-error', 'Erro ao conectar: ' + e.message, true);
    }
  });

  // Login
  $('btn-login').addEventListener('click', async () => {
    const pw = $('login-password').value;
    if (!pw) return;
    try {
      const ok = await checkLogin(pw);
      if (ok) {
        setLoggedIn();
        hide('screen-login');
        await loadApp();
      } else {
        flashMsg('login-error', 'Senha incorreta.', true);
        $('login-password').value = '';
        $('login-password').focus();
      }
    } catch (e) {
      flashMsg('login-error', e.message, true);
    }
  });

  $('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-login').click();
  });

  // Logout
  $('btn-logout').addEventListener('click', logout);

  // Tabs
  initTabs();

  // Disparos — Contatos
  $('btn-load-contacts').addEventListener('click', loadContacts);
  $('lista-select').addEventListener('change', async e => {
    if (e.target.value) await carregarListaEmDisparos(e.target.value);
  });

  // Disparos — Steps
  $('btn-add-step').addEventListener('click', () => addStep('steps-list'));

  // Disparos — Template select
  $('template-select').addEventListener('change', async e => {
    if (e.target.value) await carregarTemplateEmDisparos(e.target.value);
  });

  // Disparos — Salvar template
  $('btn-save-template').addEventListener('click', openSaveTemplateModal);

  // Disparos — Intervalo personalizado
  $('param-interval').addEventListener('change', e => {
    $('interval-custom-group').style.display = e.target.value === 'custom' ? '' : 'none';
  });

  // Disparos — Controles
  $('btn-start').addEventListener('click', startCampaign);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-stop').addEventListener('click',  stopCampaign);

  // Log — Limpar
  $('btn-clear-log').addEventListener('click', () => {
    $('log-area').innerHTML = '';
    campaign.log = [];
  });

  // Listas
  $('btn-save-lista').addEventListener('click', saveLista);

  // Templates
  $('btn-add-template-step').addEventListener('click', () => addStep('template-steps-list'));
  $('btn-save-template-tab').addEventListener('click', async () => {
    const nome = $('template-nome').value.trim();
    const steps = getStepsFromContainer('template-steps-list');
    if (!nome) { flashMsg('template-msg', 'Digite um nome para o template.', true); return; }
    if (!steps.length) { flashMsg('template-msg', 'Adicione pelo menos um bloco.', true); return; }
    const ok = await saveTemplate(nome, steps);
    if (ok) {
      flashMsg('template-msg', `Template "${nome}" salvo!`);
      $('template-nome').value = '';
      $('template-steps-list').innerHTML = '';
      await loadTemplates();
      await loadTemplatesSelect();
    }
  });

  // Histórico
  $('btn-refresh-historico').addEventListener('click', loadHistorico);

  // Configurações — Supabase
  $('btn-save-supabase').addEventListener('click', () => {
    const url = $('config-sb-url').value.trim();
    const key = $('config-sb-key').value.trim();
    if (!url || !key) { flashMsg('config-sb-msg', 'Preencha URL e Anon Key.', true); return; }
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
    flashMsg('config-sb-msg', 'Salvo. Recarregue a página para aplicar.');
  });

  // Configurações — uazapi
  $('btn-save-uazapi').addEventListener('click', saveUazapi);

  // Configurações — Senha
  $('btn-save-senha').addEventListener('click', saveSenha);

  // Modal
  $('btn-modal-cancel').addEventListener('click', closeSaveTemplateModal);
  $('btn-modal-confirm').addEventListener('click', confirmSaveTemplate);
  $('modal-template-nome').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmSaveTemplate();
  });
  $('modal-template').addEventListener('click', e => {
    if (e.target === $('modal-template')) closeSaveTemplateModal();
  });
}

// ══════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await resolveInitialScreen();
});
