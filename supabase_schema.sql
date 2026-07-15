-- Supabase database schema for E3 (Energy Efficient Environment) spice/produce drying operation management
-- Matches MongoDB collections mapped to relational PostgreSQL structures

-- ==========================================
-- 1. DROP EXISTING TABLES AND CONSTRAINTS (For clean restarts)
-- ==========================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.maintenance CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.batch_status_history CASCADE;
DROP TABLE IF EXISTS public.batches CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.machines CASCADE;
DROP TABLE IF EXISTS public.branch_product_rates CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.branches CASCADE;

DROP FUNCTION IF EXISTS public.recalculate_batch_payments();
DROP FUNCTION IF EXISTS public.calculate_batch_bill();
DROP FUNCTION IF EXISTS public.log_batch_status_change();
DROP FUNCTION IF EXISTS public.update_machine_on_batch_status_change();
DROP FUNCTION IF EXISTS public.set_customer_code();
DROP FUNCTION IF EXISTS public.set_batch_receipt_no();
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.get_user_role();
DROP FUNCTION IF EXISTS public.get_user_branch_id();

DROP SEQUENCE IF EXISTS public.customer_code_seq;
DROP SEQUENCE IF EXISTS public.batch_no_seq;
DROP SEQUENCE IF EXISTS public.receipt_no_seq;

DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS machine_status;
DROP TYPE IF EXISTS batch_status;
DROP TYPE IF EXISTS payment_mode;
DROP TYPE IF EXISTS maintenance_status;

-- ==========================================
-- 2. CUSTOM TYPES AND ENUMS
-- ==========================================
CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'Store Incharge');
CREATE TYPE machine_status AS ENUM ('Available', 'Running', 'Maintenance', 'Cleaning');
CREATE TYPE batch_status AS ENUM ('Received', 'Loaded', 'Drying', 'Completed', 'Delivered');
CREATE TYPE payment_mode AS ENUM ('Cash', 'UPI', 'Bank', 'Credit');
CREATE TYPE maintenance_status AS ENUM ('Open', 'In Progress', 'Closed');

-- ==========================================
-- 3. SEQUENCE GENERATORS FOR CODE AUTO-INCREMENTS
-- ==========================================
CREATE SEQUENCE public.customer_code_seq START WITH 1;
CREATE SEQUENCE public.batch_no_seq START WITH 1;
CREATE SEQUENCE public.receipt_no_seq START WITH 1;

-- ==========================================
-- 4. DATABASE TABLES
-- ==========================================

-- Branches Table
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Public Profiles (linked to Supabase Auth users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  mobile TEXT UNIQUE,
  role user_role NOT NULL DEFAULT 'Store Incharge',
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  google_linked BOOLEAN DEFAULT FALSE,
  picture TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Products Table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  default_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (default_rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Branch Product Rates Table (Branch specific spice rates)
CREATE TABLE public.branch_product_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rate NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, product_id)
);

-- Machines Table
CREATE TABLE public.machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  capacity NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (capacity >= 0),
  status machine_status NOT NULL DEFAULT 'Available',
  current_batch_id UUID, -- Managed dynamically via triggers, no strict FK to avoid circular dependencies
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Customers Table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- Auto-generated like C0001
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  alt_mobile TEXT DEFAULT '',
  village TEXT DEFAULT '',
  taluk TEXT DEFAULT '',
  district TEXT DEFAULT '',
  address TEXT DEFAULT '',
  gst TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  photo TEXT DEFAULT '', -- Base64 encoded or Storage path
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Batches Table (Combines Arrival, Processing, and Delivery details)
CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no TEXT UNIQUE NOT NULL, -- Auto-generated like B00001
  receipt_no TEXT UNIQUE NOT NULL, -- Auto-generated like R00001
  qr_code TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  raw_weight NUMERIC(10,2) NOT NULL CHECK (raw_weight > 0),
  estimated_dry_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (estimated_dry_weight >= 0),
  moisture NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (moisture >= 0),
  bags INTEGER NOT NULL DEFAULT 0 CHECK (bags >= 0),
  bag_weight NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (bag_weight >= 0),
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  rate_per_kg NUMERIC(10,2) NOT NULL DEFAULT 12.00 CHECK (rate_per_kg >= 0),
  loading_charges NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (loading_charges >= 0),
  discount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
  advance_paid NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (advance_paid >= 0),
  expected_delivery_date DATE,
  arrival_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  status batch_status NOT NULL DEFAULT 'Received',
  remarks TEXT DEFAULT '',
  photos TEXT[] DEFAULT '{}', -- Array of base64 photos or Supabase Storage paths
  received_from TEXT DEFAULT '',
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  
  -- Calculated Columns (Automated via Triggers)
  bill_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (bill_amount >= 0),
  total_paid NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_paid >= 0),
  balance_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  
  -- Delivery Specific Columns (Inline Delivery Object from Mongo)
  actual_dry_weight NUMERIC(10,2) CHECK (actual_dry_weight >= 0),
  processed_bags INTEGER DEFAULT 0 CHECK (processed_bags >= 0),
  weight_loss NUMERIC(10,2),
  delivered_at TIMESTAMPTZ,
  received_by TEXT,
  received_by_phone TEXT DEFAULT '',
  signature TEXT DEFAULT '', -- Base64 signature
  delivery_remarks TEXT DEFAULT '',
  
  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Batch Status History Table (Relational replacement of Mongo status_history array)
CREATE TABLE public.batch_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  status batch_status NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  remarks TEXT DEFAULT ''
);

-- Payments Table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  mode payment_mode NOT NULL DEFAULT 'Cash',
  remarks TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Expenses Table
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  vendor TEXT DEFAULT '',
  bill_photo TEXT DEFAULT '', -- Base64 encoded or Storage path
  remarks TEXT DEFAULT '',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Machine Maintenance Table
CREATE TABLE public.maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  complaint TEXT NOT NULL,
  description TEXT DEFAULT '',
  cost NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (cost >= 0),
  technician TEXT DEFAULT '',
  next_service_date DATE,
  status maintenance_status NOT NULL DEFAULT 'Open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Settings Table (KeyValue JSON store)
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Audit Logs Table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_mobile TEXT,
  user_role TEXT,
  before JSONB,
  after JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEXES FOR OPTIMAL SEARCHES
CREATE INDEX idx_profiles_branch_id ON public.profiles(branch_id);
CREATE INDEX idx_customers_code_mobile ON public.customers(code, mobile);
CREATE INDEX idx_batches_no_receipt ON public.batches(batch_no, receipt_no);
CREATE INDEX idx_batches_status ON public.batches(status);
CREATE INDEX idx_batches_branch_id ON public.batches(branch_id);
CREATE INDEX idx_payments_batch_id ON public.payments(batch_id);
CREATE INDEX idx_expenses_branch_date ON public.expenses(branch_id, expense_date);
CREATE INDEX idx_maintenance_machine_id ON public.maintenance(machine_id);

-- ==========================================
-- 5. TRIGGER FUNCTIONS FOR AUTO-GENERATED SEQUENCES
-- ==========================================

-- Trigger to automatically update updated_at column
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON public.machines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_set_updated_at BEFORE UPDATE ON public.maintenance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-generate Customer Code (e.g. C0001)
CREATE OR REPLACE FUNCTION public.set_customer_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'C' || lpad(nextval('public.customer_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_customer_code
BEFORE INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.set_customer_code();

-- Auto-generate Batch No and Receipt No (e.g. B00001, R00001)
CREATE OR REPLACE FUNCTION public.set_batch_receipt_no()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.batch_no IS NULL THEN
    NEW.batch_no := 'B' || lpad(nextval('public.batch_no_seq')::text, 5, '0');
  END IF;
  IF NEW.receipt_no IS NULL THEN
    NEW.receipt_no := 'R' || lpad(nextval('public.receipt_no_seq')::text, 5, '0');
  END IF;
  IF NEW.qr_code IS NULL THEN
    NEW.qr_code := NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_batch_receipt_no
BEFORE INSERT ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.set_batch_receipt_no();


-- ==========================================
-- 6. TRIGGER FUNCTIONS FOR DYNAMIC CALCULATIONS & RELATIONSHIPS
-- ==========================================

CREATE OR REPLACE FUNCTION public.calculate_batch_bill()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate bill_amount = raw_weight * rate + loading - discount
  NEW.bill_amount := ROUND((NEW.raw_weight * NEW.rate_per_kg) + NEW.loading_charges - NEW.discount, 2);
  
  -- Calculate balance_amount = bill_amount - total_paid
  NEW.balance_amount := NEW.bill_amount - COALESCE(NEW.total_paid, 0.00);
  
  -- Calculate weight_loss if actual_dry_weight is set
  IF NEW.actual_dry_weight IS NOT NULL THEN
    NEW.weight_loss := ROUND(NEW.raw_weight - NEW.actual_dry_weight, 2);
  ELSE
    NEW.weight_loss := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_batch_bill
BEFORE INSERT OR UPDATE OF raw_weight, estimated_dry_weight, actual_dry_weight, rate_per_kg, loading_charges, discount, total_paid ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.calculate_batch_bill();

-- Recalculate Batch Payment Totals on Payment changes
CREATE OR REPLACE FUNCTION public.recalculate_batch_payments()
RETURNS TRIGGER AS $$
DECLARE
  v_batch_id UUID;
  v_total_paid NUMERIC(10,2);
  v_bill_amount NUMERIC(10,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_batch_id := OLD.batch_id;
  ELSE
    v_batch_id := NEW.batch_id;
  END IF;

  -- Compute sum of payments
  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_total_paid
  FROM public.payments
  WHERE batch_id = v_batch_id;

  -- Fetch current bill amount
  SELECT bill_amount
  INTO v_bill_amount
  FROM public.batches
  WHERE id = v_batch_id;

  -- Apply update to batch table
  UPDATE public.batches
  SET 
    total_paid = v_total_paid,
    balance_amount = v_bill_amount - v_total_paid,
    updated_at = now()
  WHERE id = v_batch_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_batch_payments
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.recalculate_batch_payments();

-- Automatically Log Status History when batch status changes
CREATE OR REPLACE FUNCTION public.log_batch_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.batch_status_history (batch_id, status, changed_by, remarks)
    VALUES (
      NEW.id,
      NEW.status,
      NEW.updated_by,
      COALESCE(NEW.remarks, '')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_batch_status_change
AFTER INSERT OR UPDATE OF status ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.log_batch_status_change();

-- Sync Machine Status on Batch updates (Assign machine to Running, release machine on Delivered)
CREATE OR REPLACE FUNCTION public.update_machine_on_batch_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- When transitioning to Loaded
  IF NEW.status = 'Loaded' AND NEW.machine_id IS NOT NULL THEN
    UPDATE public.machines
    SET status = 'Running',
        current_batch_id = NEW.id
    WHERE id = NEW.machine_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- If machine is reassigned, set old machine to Available
    IF OLD.machine_id IS DISTINCT FROM NEW.machine_id AND OLD.machine_id IS NOT NULL THEN
      UPDATE public.machines
      SET status = 'Available',
          current_batch_id = NULL
      WHERE id = OLD.machine_id;
    END IF;
    
    -- When transitioning to Delivered, release machine
    IF NEW.status = 'Delivered' AND NEW.machine_id IS NOT NULL THEN
      UPDATE public.machines
      SET status = 'Available',
          current_batch_id = NULL
      WHERE id = NEW.machine_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_machine_on_status_change
AFTER INSERT OR UPDATE OF status, machine_id ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.update_machine_on_batch_status_change();


-- ==========================================
-- 7. SUPABASE AUTH LINKAGE: AUTO-PROFILE CREATION
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, google_linked, picture)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'Store Incharge', -- Default role
    COALESCE((new.raw_user_meta_data->>'google_linked')::boolean, false),
    COALESCE(new.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==========================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Helper Functions (defined with SECURITY DEFINER to bypass profile query loops)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS uuid AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Enable RLS on all tables
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Branches Policies
CREATE POLICY branches_read_policy ON public.branches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY branches_write_policy ON public.branches
  FOR ALL TO authenticated USING (public.get_user_role() = 'Admin');

-- Profiles Policies
CREATE POLICY profiles_read_policy ON public.profiles
  FOR SELECT TO authenticated USING (public.get_user_role() IN ('Admin', 'Manager') OR id = auth.uid());
CREATE POLICY profiles_insert_policy ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'Admin');
CREATE POLICY profiles_update_policy ON public.profiles
  FOR UPDATE TO authenticated USING (public.get_user_role() = 'Admin' OR id = auth.uid());
CREATE POLICY profiles_delete_policy ON public.profiles
  FOR DELETE TO authenticated USING (public.get_user_role() = 'Admin');

-- Products Policies
CREATE POLICY products_read_policy ON public.products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY products_write_policy ON public.products
  FOR ALL TO authenticated USING (public.get_user_role() = 'Admin');

-- Settings Policies
CREATE POLICY settings_read_policy ON public.settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_write_policy ON public.settings
  FOR ALL TO authenticated USING (public.get_user_role() = 'Admin');

-- Machines Policies
CREATE POLICY machines_read_policy ON public.machines
  FOR SELECT TO authenticated USING (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY machines_insert_policy ON public.machines
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'Admin');
CREATE POLICY machines_update_policy ON public.machines
  FOR UPDATE TO authenticated USING (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY machines_delete_policy ON public.machines
  FOR DELETE TO authenticated USING (public.get_user_role() = 'Admin');

-- Customers Policies
CREATE POLICY customers_read_policy ON public.customers
  FOR SELECT TO authenticated USING (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY customers_insert_policy ON public.customers
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY customers_update_policy ON public.customers
  FOR UPDATE TO authenticated USING (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY customers_delete_policy ON public.customers
  FOR DELETE TO authenticated USING (public.get_user_role() = 'Admin');

-- Batches Policies
CREATE POLICY batches_read_policy ON public.batches
  FOR SELECT TO authenticated USING (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY batches_insert_policy ON public.batches
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY batches_update_policy ON public.batches
  FOR UPDATE TO authenticated USING (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY batches_delete_policy ON public.batches
  FOR DELETE TO authenticated USING (public.get_user_role() = 'Admin');

-- Batch Status History Policies
CREATE POLICY batch_status_history_read_policy ON public.batch_status_history
  FOR SELECT TO authenticated USING (
    public.get_user_role() = 'Admin' OR 
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = batch_id AND batches.branch_id = public.get_user_branch_id())
  );
CREATE POLICY batch_status_history_insert_policy ON public.batch_status_history
  FOR INSERT TO authenticated WITH CHECK (
    public.get_user_role() = 'Admin' OR 
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = batch_id AND batches.branch_id = public.get_user_branch_id())
  );

-- Payments Policies
CREATE POLICY payments_read_policy ON public.payments
  FOR SELECT TO authenticated USING (
    public.get_user_role() = 'Admin' OR 
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = batch_id AND batches.branch_id = public.get_user_branch_id())
  );
CREATE POLICY payments_insert_policy ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    public.get_user_role() = 'Admin' OR 
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = batch_id AND batches.branch_id = public.get_user_branch_id())
  );
CREATE POLICY payments_write_policy ON public.payments
  FOR ALL TO authenticated USING (public.get_user_role() = 'Admin');

-- Expenses Policies
CREATE POLICY expenses_read_policy ON public.expenses
  FOR SELECT TO authenticated USING (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY expenses_insert_policy ON public.expenses
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY expenses_update_policy ON public.expenses
  FOR UPDATE TO authenticated USING (public.get_user_role() = 'Admin' OR branch_id = public.get_user_branch_id());
CREATE POLICY expenses_delete_policy ON public.expenses
  FOR DELETE TO authenticated USING (public.get_user_role() = 'Admin');

-- Machine Maintenance Policies
CREATE POLICY maintenance_read_policy ON public.maintenance
  FOR SELECT TO authenticated USING (
    public.get_user_role() = 'Admin' OR 
    EXISTS (SELECT 1 FROM public.machines WHERE machines.id = machine_id AND machines.branch_id = public.get_user_branch_id())
  );
CREATE POLICY maintenance_insert_policy ON public.maintenance
  FOR INSERT TO authenticated WITH CHECK (
    public.get_user_role() = 'Admin' OR 
    EXISTS (SELECT 1 FROM public.machines WHERE machines.id = machine_id AND machines.branch_id = public.get_user_branch_id())
  );
CREATE POLICY maintenance_write_policy ON public.maintenance
  FOR ALL TO authenticated USING (public.get_user_role() = 'Admin');

-- Audit Logs Policies
CREATE POLICY audit_logs_read_policy ON public.audit_logs
  FOR SELECT TO authenticated USING (public.get_user_role() IN ('Admin', 'Manager'));
CREATE POLICY audit_logs_insert_policy ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);
