const express  = require('express');
const path     = require('path');

// Carregamento condicional: no Render, o pacote sempre estará instalado
let createClient;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch {
  console.warn('AVISO: @supabase/supabase-js não encontrado. Execute npm install.');
}

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' })); // suporta imagens base64 nos templates
app.use(express.static(__dirname, { index: 'index.html', dotfiles: 'ignore' }));

// ─── Supabase com service role key (bypassa RLS) ───────────────────────────
function getSupabase() {
  if (!createClient) throw new Error('Pacote @supabase/supabase-js não instalado. Execute npm install.');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase não configurado no servidor.');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Health check / config ─────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const ok = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  if (!ok) return res.status(503).json({ error: 'Servidor não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_KEY nas variáveis de ambiente.' });
  res.json({ ok: true });
});

// ══════════════════════════════════════════
// DB — disparos_config
// ══════════════════════════════════════════

app.get('/api/db/config', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_config').select('*').limit(1).maybeSingle();
    if (error) throw error;
    res.json(data || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/db/config', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_config').insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atualiza campos uazapi (instance_url, api_token) via upsert
app.put('/api/db/config/:id', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_config')
      .upsert({ id: req.params.id, ...req.body }, { onConflict: 'id' })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atualiza apenas a senha
app.patch('/api/db/config/:id/password', async (req, res) => {
  try {
    const { error } = await getSupabase()
      .from('disparos_config')
      .update({ senha_app: req.body.senha_app })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════
// DB — disparos_listas
// ══════════════════════════════════════════

app.get('/api/db/listas', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_listas').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/db/listas/:id', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_listas').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/db/listas', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_listas').insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/db/listas/:id', async (req, res) => {
  try {
    const { error } = await getSupabase()
      .from('disparos_listas').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════
// DB — disparos_templates
// ══════════════════════════════════════════

app.get('/api/db/templates', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_templates').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/db/templates/:id', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_templates').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/db/templates', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_templates').insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/db/templates/:id', async (req, res) => {
  try {
    const { error } = await getSupabase()
      .from('disparos_templates').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════
// DB — disparos_historico
// ══════════════════════════════════════════

app.get('/api/db/historico', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_historico').select('*')
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/db/historico', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('disparos_historico').insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/db/historico/:id', async (req, res) => {
  try {
    const { error } = await getSupabase()
      .from('disparos_historico').update(req.body).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Fallback SPA ──────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Disparos WhatsApp rodando na porta ${PORT}`);
});
