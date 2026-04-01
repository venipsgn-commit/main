-- ============================================================
-- VENIPS – Index Supabase à exécuter dans l'éditeur SQL
-- Table: records (table_name text, id bigint, data jsonb)
-- ============================================================

-- 1. Index sur table_name (accélérer tous les filtres par table)
CREATE INDEX IF NOT EXISTS idx_records_table_name
  ON records(table_name);

-- 2. Index composite table_name + id (accélérer les lookups par id)
CREATE INDEX IF NOT EXISTS idx_records_table_id
  ON records(table_name, id);

-- 3. Index GIN sur data (accélérer les recherches dans le JSON)
CREATE INDEX IF NOT EXISTS idx_records_data_gin
  ON records USING gin(data);

-- 4. Vérifier que les index existent
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'records';
