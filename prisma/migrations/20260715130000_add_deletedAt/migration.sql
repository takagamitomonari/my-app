-- Add deletedAt column to Transaction
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;