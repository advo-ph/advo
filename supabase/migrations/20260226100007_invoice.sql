-- ============================================================
-- Invoice table + invoice_status enum
-- ============================================================

-- 1. Create enum
CREATE TYPE public.invoice_status AS ENUM ('unpaid', 'paid', 'overdue');

-- 2. Create table (ADVO Standard)
CREATE TABLE public.invoice (
    invoice_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES public.project (project_id) ON DELETE CASCADE,
    amount_cents BIGINT NOT NULL,
    label TEXT NOT NULL,
    status public.invoice_status NOT NULL DEFAULT 'unpaid',
    due_date DATE,
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. RLS
ALTER TABLE public.invoice ENABLE ROW LEVEL SECURITY;

-- Admin: full access via is_admin()
CREATE POLICY "Admins can manage invoices" ON public.invoice FOR ALL USING (public.is_admin ())
WITH
    CHECK (public.is_admin ());

-- Client: read-only access via project → client → user_id chain
CREATE POLICY "Clients can view own invoices" ON public.invoice FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.project p
                JOIN public.client c ON c.client_id = p.client_id
            WHERE
                p.project_id = invoice.project_id
                AND c.user_id = auth.uid ()
        )
    );

-- Index for FK lookups
CREATE INDEX idx_invoice_project_id ON public.invoice (project_id);