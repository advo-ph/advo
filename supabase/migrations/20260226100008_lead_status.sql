-- ============================================================
-- Lead status enum + new columns
-- ============================================================

-- 1. Create enum
CREATE TYPE public.lead_status AS ENUM (
    'new',
    'contacted',
    'qualified',
    'proposal_sent',
    'closed_won',
    'closed_lost'
);

-- 2. Add columns to lead table
ALTER TABLE public.lead
ADD COLUMN status public.lead_status NOT NULL DEFAULT 'new',
ADD COLUMN assigned_to BIGINT REFERENCES public.team_member (team_member_id) ON DELETE SET NULL,
ADD COLUMN notes TEXT;

-- 3. Index for FK
CREATE INDEX idx_lead_assigned_to ON public.lead (assigned_to);