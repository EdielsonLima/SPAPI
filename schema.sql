-- =============================================================================
-- SPAPI - Schema do banco de dados
-- Execute este arquivo na primeira configuração de cada instância (empresa).
-- Todas as tabelas usam ON CONFLICT para upsert seguro.
-- =============================================================================

-- ── Empresas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cached_companies (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  cached_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Centros de Custo ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cached_cost_centers (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  cnpj       TEXT,
  id_company INTEGER,
  cached_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Fornecedores / Credores ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cached_creditors (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  cached_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Plano Financeiro (Categorias de Pagamento) ────────────────────────────────
CREATE TABLE IF NOT EXISTS cached_financial_plans (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  tp_conta  TEXT,
  fl_ativa  TEXT,
  cached_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Status de Entrega de Pedidos de Compra ────────────────────────────────────
CREATE TABLE IF NOT EXISTS cached_delivery_status (
  order_id        INTEGER PRIMARY KEY,
  delivery_status TEXT    NOT NULL,
  order_status    TEXT,
  total_items     INTEGER,
  total_delivered INTEGER,
  total_pending   INTEGER,
  cached_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Itens de Pedidos de Compra ────────────────────────────────────────────────
-- Cache permanente: itens raramente mudam após o pedido ser autorizado.
-- Use forceRefresh para invalidar manualmente se necessário.
CREATE TABLE IF NOT EXISTS cached_order_items (
  order_id  INTEGER PRIMARY KEY,
  items     JSONB   NOT NULL,
  cached_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Cronogramas de Entrega por Item ───────────────────────────────────────────
-- Cache com TTL de 2 horas: muda conforme entregas são registradas.
CREATE TABLE IF NOT EXISTS cached_delivery_schedules (
  order_id    INTEGER NOT NULL,
  item_number INTEGER NOT NULL,
  schedules   JSONB   NOT NULL,
  cached_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, item_number)
);

-- ── Confirmações de Chegada de Insumos na Obra ───────────────────────────────
-- Registro por item do pedido feito pelos colaboradores em campo.
CREATE TABLE IF NOT EXISTS arrival_confirmations (
  id                 SERIAL PRIMARY KEY,
  purchase_order_id  INTEGER   NOT NULL,
  item_number        INTEGER   NOT NULL,
  confirmed_by       TEXT      NOT NULL,
  quantity           NUMERIC,
  notes              TEXT      NOT NULL,
  file_name          TEXT      NOT NULL,
  file_mime_type     TEXT      NOT NULL,
  file_path          TEXT      NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Pedidos de Compra (cache paginado por data range) ─────────────────────────
-- cache_key = "startDate:endDate:limit:offset"
-- forceRefresh deleta todas as linhas do mesmo startDate:endDate e re-busca.
CREATE TABLE IF NOT EXISTS cached_purchase_orders (
  cache_key  TEXT      PRIMARY KEY,
  data       JSONB     NOT NULL,
  cached_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Outcome Financeiro (Contas a Pagar) ───────────────────────────────────────
-- Cache persistente por período (start_date, end_date).
-- Substitui o cache in-memory de 5 minutos da rota /api/sienge/outcome.
CREATE TABLE IF NOT EXISTS cached_outcome (
  start_date TEXT      NOT NULL,
  end_date   TEXT      NOT NULL,
  data       JSONB     NOT NULL,
  cached_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (start_date, end_date)
);

-- ── Movimentações Bancárias (Bank Movements) ────────────────────────────────
-- Cache de movimentos avulsos (tarifas/taxas bancárias sem título).
CREATE TABLE IF NOT EXISTS cached_bank_movements (
  start_date TEXT      NOT NULL,
  end_date   TEXT      NOT NULL,
  data       JSONB     NOT NULL,
  cached_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (start_date, end_date)
);

-- ── Income Financeiro (Contas a Receber) ────────────────────────────────────
-- Cache persistente por período (start_date, end_date).
CREATE TABLE IF NOT EXISTS cached_income (
  start_date TEXT      NOT NULL,
  end_date   TEXT      NOT NULL,
  data       JSONB     NOT NULL,
  cached_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (start_date, end_date)
);

-- ── Configurações de Empresas (M² e Fator) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS company_settings (
  company_id   INTEGER PRIMARY KEY REFERENCES cached_companies(id),
  company_name TEXT    NOT NULL,
  area_m2      NUMERIC(12,2) NOT NULL DEFAULT 0,
  factor       NUMERIC(6,4) NOT NULL DEFAULT 1,
  status       TEXT    NOT NULL DEFAULT 'ativa',
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Cache CUB SC ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cached_cub (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  data       JSONB     NOT NULL,
  cached_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Override Manual do CUB SC ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cub_override (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  value               NUMERIC(10,2) NOT NULL,
  month_label         TEXT NOT NULL,
  monthly_variation   NUMERIC(6,2) NOT NULL DEFAULT 0,
  yearly_accumulated  NUMERIC(6,2) NOT NULL DEFAULT 0,
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Exclusão de Títulos (ignorar títulos nos cálculos financeiros) ────────
CREATE TABLE IF NOT EXISTS bill_exclusions (
  company_id      INTEGER NOT NULL,
  bill_id         INTEGER NOT NULL,
  company_name    TEXT    NOT NULL,
  client_name     TEXT    NOT NULL DEFAULT '',
  due_date        TEXT    NOT NULL DEFAULT '',
  original_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  observation     TEXT    NOT NULL DEFAULT '',
  reason          TEXT    NOT NULL DEFAULT '',
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, bill_id)
);

-- ── Migração: adicionar coluna status em company_settings ──────────────────
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativa';

-- ── Migração: adicionar colunas extras em bill_exclusions ─────────────────
ALTER TABLE bill_exclusions ADD COLUMN IF NOT EXISTS client_name TEXT NOT NULL DEFAULT '';
ALTER TABLE bill_exclusions ADD COLUMN IF NOT EXISTS due_date TEXT NOT NULL DEFAULT '';
ALTER TABLE bill_exclusions ADD COLUMN IF NOT EXISTS original_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE bill_exclusions ADD COLUMN IF NOT EXISTS observation TEXT NOT NULL DEFAULT '';

-- ── Mapeamentos DRE (associação contas plano financeiro → categorias DRE) ──
CREATE TABLE IF NOT EXISTS dre_mappings (
  id                  SERIAL PRIMARY KEY,
  dre_category        VARCHAR(50)  NOT NULL,
  financial_plan_id   VARCHAR(50)  NOT NULL,
  financial_plan_name VARCHAR(255) NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(dre_category, financial_plan_id)
);

-- ── Dados DRE do Excel (fonte principal, por empresa) ──────────────────────────
DROP TABLE IF EXISTS dre_excel_supplementary;
CREATE TABLE IF NOT EXISTS dre_excel_supplementary (
  year                VARCHAR(4)   NOT NULL,
  company_id          VARCHAR(10)  NOT NULL DEFAULT '',
  company_name        VARCHAR(200) NOT NULL DEFAULT '',
  financial_plan_id   VARCHAR(20)  NOT NULL,
  financial_plan_name VARCHAR(200) NOT NULL,
  dre_category        VARCHAR(50)  NOT NULL DEFAULT '',
  amount              NUMERIC(18,2) NOT NULL DEFAULT 0,
  cached_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year, company_id, financial_plan_id)
);
CREATE INDEX IF NOT EXISTS idx_dre_excel_supp_year ON dre_excel_supplementary(year);

-- =============================================================================
-- Índices para performance
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_cached_creditors_name       ON cached_creditors (name);
CREATE INDEX IF NOT EXISTS idx_cached_companies_name       ON cached_companies (name);
CREATE INDEX IF NOT EXISTS idx_cached_cost_centers_name    ON cached_cost_centers (name);
CREATE INDEX IF NOT EXISTS idx_cached_financial_plans_name ON cached_financial_plans (name);
CREATE INDEX IF NOT EXISTS idx_arrival_confirmations_order ON arrival_confirmations (purchase_order_id);
