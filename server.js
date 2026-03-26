const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (index.html, app.js, style.css)
app.use(express.static(__dirname, {
  index: 'index.html',
  dotfiles: 'ignore'
}));

// Config endpoint — credenciais vêm de variáveis de ambiente do Render
// Nunca ficam no código ou no browser do usuário
app.get('/api/config', (req, res) => {
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_KEY;

  if (!sbUrl || !sbKey) {
    return res.status(503).json({ error: 'Servidor não configurado. Defina SUPABASE_URL e SUPABASE_KEY nas variáveis de ambiente.' });
  }

  // Admin token NÃO é enviado ao client — fica apenas no servidor
  res.json({ sbUrl, sbKey });
});

// Fallback para SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Disparos WhatsApp rodando na porta ${PORT}`);
});
