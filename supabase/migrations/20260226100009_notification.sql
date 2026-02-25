-- ============================================================
-- Notification table + notification_type enum
-- ============================================================

-- 1. Create enum
CREATE TYPE public.notification_type AS ENUM (
    'progress_update',
    'invoice_issued',
    'deliverable_completed',
    'project_status_change',
    'custom'
);

-- 2. Create table (ADVO Standard)
CREATE TABLE public.notification (
    notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES public.client (client_id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES public.project (project_id) ON DELETE SET NULL,
    type public.notification_type NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. RLS
ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admins can manage notifications" ON public.notification FOR ALL USING (public.is_admin ())
WITH
    CHECK (public.is_admin ());

-- Client: read own notifications
CREATE POLICY "Clients can view own notifications" ON public.notification FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.client c
            WHERE
                c.client_id = notification.client_id
                AND c.user_id = auth.uid ()
        )
    );

-- Client: update own notifications (mark read)
CREATE POLICY "Clients can mark own notifications read" ON public.notification FOR
UPDATE USING (
    EXISTS (
        SELECT 1
        FROM public.client c
        WHERE
            c.client_id = notification.client_id
            AND c.user_id = auth.uid ()
    )
)
WITH
    CHECK (
        EXISTS (
            SELECT 1
            FROM public.client c
            WHERE
                c.client_id = notification.client_id
                AND c.user_id = auth.uid ()
        )
    );

-- Indexes
CREATE INDEX idx_notification_client_id ON public.notification (client_id);

CREATE INDEX idx_notification_sent_at ON public.notification (sent_at DESC);