-- =========================================================================
-- EThree Agro Solutions: High-Performance Database Indexes & Keep-Alive Helper
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =========================================================================

-- 1. Batches Table Indexes (High-frequency dashboard & reporting filters)
CREATE INDEX IF NOT EXISTS idx_batches_branch_created ON public.batches(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_arrival_date ON public.batches(arrival_date);
CREATE INDEX IF NOT EXISTS idx_batches_delivered_at ON public.batches(delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batches_status_branch ON public.batches(status, branch_id);
CREATE INDEX IF NOT EXISTS idx_batches_customer_id ON public.batches(customer_id);
CREATE INDEX IF NOT EXISTS idx_batches_balance ON public.batches(balance_amount) WHERE balance_amount > 0;

-- 2. Payments Table Indexes (Dashboard collections, cashbook, and customer history)
CREATE INDEX IF NOT EXISTS idx_payments_branch_created ON public.payments(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_batch_id ON public.payments(batch_id);

-- 3. Expenses Table Indexes (P&L and dashboard reporting)
CREATE INDEX IF NOT EXISTS idx_expenses_branch_created ON public.expenses(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);

-- 4. Customers Table Indexes (Instant customer list, branch filter, and search)
CREATE INDEX IF NOT EXISTS idx_customers_branch_created ON public.customers(branch_id, is_deleted, created_at DESC);

-- 5. Machines Table Indexes
CREATE INDEX IF NOT EXISTS idx_machines_branch_status ON public.machines(branch_id, status);

-- 6. Audit Logs Index (Recent activity queries)
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);

-- 7. Analyze tables so PostgreSQL query planner immediately uses the new indexes
ANALYZE public.batches;
ANALYZE public.payments;
ANALYZE public.expenses;
ANALYZE public.customers;
ANALYZE public.machines;
ANALYZE public.audit_logs;

