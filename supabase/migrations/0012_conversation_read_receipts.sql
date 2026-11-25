-- ============================================================================
-- I-BITA — MIGRACIÓN 0012: ESTADO DE LECTURA POR CONVERSACIÓN Y USUARIO
-- Permite detectar mensajes nuevos no leídos para huéspedes y anfitriones.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversation_read_states (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_read_states_user
  ON public.conversation_read_states (user_id, last_read_at DESC);

ALTER TABLE public.conversation_read_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_read_states_select_own" ON public.conversation_read_states;
CREATE POLICY "conversation_read_states_select_own" ON public.conversation_read_states
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "conversation_read_states_insert_own" ON public.conversation_read_states;
CREATE POLICY "conversation_read_states_insert_own" ON public.conversation_read_states
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "conversation_read_states_update_own" ON public.conversation_read_states;
CREATE POLICY "conversation_read_states_update_own" ON public.conversation_read_states
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.conversation_read_states TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
