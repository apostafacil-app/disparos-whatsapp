# Disparos WhatsApp

Sistema de envio de campanhas WhatsApp em massa via API uazapi.
Hospedado no GitHub Pages — sem backend próprio.

---

## Setup

### 1. Supabase — criar tabelas

No seu projeto Supabase, execute o SQL abaixo no **SQL Editor**:

```sql
create table disparos_config (
  id uuid primary key default gen_random_uuid(),
  instance_url text default '',
  api_token text default '',
  senha_app text default '',
  updated_at timestamptz default now()
);

create table disparos_listas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numeros text not null,
  created_at timestamptz default now()
);

create table disparos_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  steps jsonb not null default '[]',
  created_at timestamptz default now()
);

create table disparos_historico (
  id uuid primary key default gen_random_uuid(),
  nome text,
  total integer default 0,
  enviados integer default 0,
  erros integer default 0,
  status text default 'concluido',
  log jsonb default '[]',
  created_at timestamptz default now()
);
```

> **RLS**: Para uso pessoal, pode desabilitar RLS nas 4 tabelas (Table Editor → RLS → Disable).

### 2. GitHub Pages

1. Crie um repositório público: `apostafacil-app/disparos-whatsapp`
2. Faça push de todos os arquivos para a branch `main`
3. Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `/ (root)`
4. Acesse em: `https://apostafacil-app.github.io/disparos-whatsapp/`

### 3. Primeiro acesso

1. Abra o app
2. Na tela de **Setup**, insira:
   - **Supabase Project URL**: `https://xxxx.supabase.co`
   - **Supabase Anon Key**: encontrado em Project Settings → API
3. Clique em **Salvar e Continuar**
4. Faça login com a senha padrão: `admin123`
5. Vá em **Configurações** → insira URL e Token do uazapi
6. Em **Configurações → Acesso**, altere a senha padrão

---

## Uso

### Enviando uma campanha

1. Aba **Disparos** → insira números na área de contatos (DDD + número, sem +55)
2. Adicione blocos de mensagem (texto, imagem, áudio ou documento)
3. Configure os parâmetros (intervalo, pausas)
4. Clique em **▶ Iniciar**

### Tipos de mensagem suportados

| Tipo | Descrição |
|------|-----------|
| Texto | Mensagem de texto (suporta `*negrito*`, `_itálico_`, `~tachado~`) |
| Imagem | Upload de arquivo de imagem + legenda opcional |
| Áudio | URL pública de arquivo de áudio (PTT) |
| Documento | Upload de PDF, Word, Excel etc. |

### Formato dos números

- Insira o DDD + número sem o código do país: `31975097388`
- O sistema adiciona automaticamente o `55` no início
- Aceita também: `5531975097388` (já formatado)
- Separe por vírgula ou quebra de linha

---

## Stack

- **Frontend**: HTML + CSS + JavaScript puro (sem frameworks)
- **Banco de dados**: Supabase (PostgreSQL)
- **WhatsApp API**: uazapi
- **Hospedagem**: GitHub Pages

---

## Senha padrão

`admin123` — **altere imediatamente** em Configurações → Acesso ao Sistema.
