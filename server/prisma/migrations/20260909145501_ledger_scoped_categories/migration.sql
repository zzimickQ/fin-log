-- Categories become ledger-scoped: every ledger owns its own self-contained
-- category hierarchy instead of sharing one family-wide tree.
--
-- Data migration (pruned clone):
--   For each ledger that has at least one categorized expense, clone the
--   categories it references together with their ancestor chain (so each
--   clone keeps a valid path to the root), then remap the ledger's expenses
--   to the clones. Ledgers with no categorized expenses get no categories.
--   Original (family-scoped) rows that were never cloned are deleted.

-- 1. Add a nullable ledger scope first so the data can be migrated.
ALTER TABLE "expense_category" ADD COLUMN "ledgerId" TEXT;

-- 2. Drop the family-scoped indexes/FK before cloning: clones still carry the
--    (soon-dropped) familyId column, and the family-scoped unique indexes
--    would otherwise reject duplicate sibling names.
DROP INDEX "expense_category_familyId_idx";
DROP INDEX "expense_category_familyId_parentId_name_key";
DROP INDEX "expense_category_familyId_name_root_key";
ALTER TABLE "expense_category" DROP CONSTRAINT "expense_category_familyId_fkey";

-- 3. Clone per ledger: referenced categories + ancestors, then remap parents
--    and expenses. Temp tables are dropped at the end of each ledger pass.
DO $fn$
DECLARE
  lg RECORD;
  cat RECORD;
  orig RECORD;
  p_new TEXT;
  new_id TEXT;
  fam_id TEXT;
BEGIN
  FOR lg IN
    SELECT DISTINCT e."ledgerId" AS id
    FROM "expense" e
    WHERE e."categoryId" IS NOT NULL
  LOOP
    SELECT l."familyId" INTO fam_id FROM "ledger" l WHERE l.id = lg.id;

    -- The original (family-scoped) categories this ledger needs: every
    -- category referenced by one of its expenses, plus every ancestor.
    CREATE TEMP TABLE tmp_need (old_id TEXT PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO tmp_need
    WITH RECURSIVE chain AS (
      SELECT DISTINCT e."categoryId" AS cid
      FROM "expense" e
      WHERE e."ledgerId" = lg.id AND e."categoryId" IS NOT NULL
      UNION
      SELECT c."parentId"
      FROM chain ch
      JOIN "expense_category" c ON c.id = ch.cid
      WHERE c."parentId" IS NOT NULL
    )
    SELECT cid FROM chain;

    -- old original id -> freshly cloned id (for this ledger)
    CREATE TEMP TABLE tmp_map (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL) ON COMMIT DROP;

    FOR cat IN
      SELECT c.id, c.name, c.description, c."createdAt", c."updatedAt"
      FROM "expense_category" c
      JOIN tmp_need n ON n.old_id = c.id
    LOOP
      new_id := gen_random_uuid()::TEXT;
      -- familyId is still NOT NULL at this point; it is dropped below.
      INSERT INTO "expense_category" (id, "familyId", "ledgerId", name, description, "parentId", "createdAt", "updatedAt")
      VALUES (new_id, fam_id, lg.id, cat.name, cat.description, NULL, cat."createdAt", cat."updatedAt");
      INSERT INTO tmp_map (old_id, new_id) VALUES (cat.id, new_id);
    END LOOP;

    -- Point each clone at the clone of its original parent (same ledger).
    FOR orig IN
      SELECT c.id, c."parentId"
      FROM "expense_category" c
      WHERE c."ledgerId" = lg.id
    LOOP
      IF orig."parentId" IS NULL THEN
        CONTINUE;
      END IF;
      SELECT m.new_id INTO p_new FROM tmp_map m WHERE m.old_id = orig."parentId";
      IF p_new IS NOT NULL THEN
        UPDATE "expense_category" SET "parentId" = p_new WHERE id = orig.id;
      END IF;
    END LOOP;

    -- Re-point the ledger's expenses at their ledger's clone.
    UPDATE "expense" e
    SET "categoryId" = m.new_id
    FROM tmp_map m
    WHERE e."ledgerId" = lg.id
      AND e."categoryId" = m.old_id;

    DROP TABLE tmp_need;
    DROP TABLE tmp_map;
  END LOOP;
END
$fn$;

-- 4. Original family-scoped rows are now unreferenced (any expense that used
--    one was remapped above). Delete them; the self-referencing parent FK
--    cascades off any remaining subtree.
DELETE FROM "expense_category" WHERE "ledgerId" IS NULL;

-- 5. Drop the family column entirely.
ALTER TABLE "expense_category" DROP COLUMN "familyId";

-- 6. Make the ledger scope required and re-create indexes under it.
ALTER TABLE "expense_category" ALTER COLUMN "ledgerId" SET NOT NULL;

CREATE INDEX "expense_category_ledgerId_idx" ON "expense_category"("ledgerId");

-- Prevent duplicate sibling categories within a ledger.
CREATE UNIQUE INDEX "expense_category_ledgerId_parentId_name_key"
  ON "expense_category" ("ledgerId", "parentId", "name");

-- Postgres treats NULLs as distinct in unique constraints, so the composite
-- unique (ledger_id, parent_id, name) does not cover root categories
-- (parent_id IS NULL). Enforce root-level name uniqueness with a partial index.
CREATE UNIQUE INDEX "expense_category_ledgerId_name_root_key"
  ON "expense_category" ("ledgerId", "name")
  WHERE "parentId" IS NULL;

ALTER TABLE "expense_category" ADD CONSTRAINT "expense_category_ledgerId_fkey"
  FOREIGN KEY ("ledgerId") REFERENCES "ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
