-- AlterEnum
-- Two new ways to divide a bill, added after the first release of this schema.
-- Both are weighted allocations that end up as exact centavo amounts in the
-- share rows, exactly as EQUAL and CUSTOM already do; the method is recorded
-- distinctly because resolved amounts cannot be turned back into what produced
-- them. ₱400 of ₱800 is equally 50%, a weight of 2 against 2, or a typed figure.
--
-- PostgreSQL 12 and later accept several ADD VALUE statements in one migration,
-- provided none of the new values is used before it commits — nothing here does.
-- On 11 and earlier this would have to be split into two migrations. Supabase
-- runs 15, so it is left as one.
ALTER TYPE "SplitMethod" ADD VALUE 'PERCENTAGE';
ALTER TYPE "SplitMethod" ADD VALUE 'SHARES';

-- AlterTable
-- What was typed to arrive at a share: the percentage for PERCENTAGE, the
-- weight for SHARES. Nullable, so this is a metadata-only change that rewrites
-- no rows — and the table is empty everywhere in any case, since the migration
-- that created it has not been applied.
ALTER TABLE "SharedExpenseShare" ADD COLUMN     "splitInput" DECIMAL(12,4);
