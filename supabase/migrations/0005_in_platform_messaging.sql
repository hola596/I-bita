-- ============================================================================
-- I-BITA — MIGRACIÓN 0005: MENSAJERÍA INTERNA UNIFICADA EN LA PLATAFORMA
-- Toda comunicación (soporte, aprobación de anfitriones y entrevistas 1–6m)
-- ocurre dentro de I-bita sin flujos conversacionales externos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('SUPPORT_INQUIRY', 'HOST_APPROVAL', 'BOOKING_INTERVIEW')),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  guest_or_requester_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requester_name TEXT,
  requester_email TEXT,
  host_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  contact_inquiry_id UUID REFERENCES public.contact_inquiries(id) ON DELETE SET NULL,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_booking_unique
  ON public.conversations (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_inquiry_unique
  ON public.conversations (contact_inquiry_id)
  WHERE contact_inquiry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_host_approval_unique
  ON public.conversations (guest_or_requester_id, kind)
  WHERE kind = 'HOST_APPROVAL' AND guest_or_requester_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_requester_recent
  ON public.conversations (guest_or_requester_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_host_recent
  ON public.conversations (host_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_kind_recent
  ON public.conversations (kind, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('GUEST', 'HOST', 'ADMIN', 'SYSTEM')),
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
  message_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT', 'INTERVIEW_PROPOSAL', 'SYSTEM_NOTICE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv_created
  ON public.conversation_messages (conversation_id, created_at ASC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_participant" ON public.conversations;
CREATE POLICY "conversations_select_participant" ON public.conversations
  FOR SELECT USING (
    auth.uid() = guest_or_requester_id
    OR auth.uid() = host_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'SUPERADMIN'
    )
  );

DROP POLICY IF EXISTS "conversations_insert_participant" ON public.conversations;
CREATE POLICY "conversations_insert_participant" ON public.conversations
  FOR INSERT WITH CHECK (
    auth.uid() = guest_or_requester_id
    OR auth.uid() = host_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'SUPERADMIN'
    )
  );

DROP POLICY IF EXISTS "conversations_update_participant" ON public.conversations;
CREATE POLICY "conversations_update_participant" ON public.conversations
  FOR UPDATE USING (
    auth.uid() = guest_or_requester_id
    OR auth.uid() = host_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'SUPERADMIN'
    )
  )
  WITH CHECK (
    auth.uid() = guest_or_requester_id
    OR auth.uid() = host_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'SUPERADMIN'
    )
  );

DROP POLICY IF EXISTS "conversation_messages_select_participant" ON public.conversation_messages;
CREATE POLICY "conversation_messages_select_participant" ON public.conversation_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (
          c.guest_or_requester_id = auth.uid()
          OR c.host_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'SUPERADMIN'
          )
        )
    )
  );

DROP POLICY IF EXISTS "conversation_messages_insert_participant" ON public.conversation_messages;
CREATE POLICY "conversation_messages_insert_participant" ON public.conversation_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (
          c.guest_or_requester_id = auth.uid()
          OR c.host_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'SUPERADMIN'
          )
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated, service_role;
GRANT SELECT, INSERT ON public.conversation_messages TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
