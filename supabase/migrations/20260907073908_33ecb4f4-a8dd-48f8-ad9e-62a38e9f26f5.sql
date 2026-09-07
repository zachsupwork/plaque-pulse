CREATE POLICY "nfc_handoffs_no_client_access" ON public.nfc_handoffs FOR SELECT TO authenticated, anon USING (false);
CREATE POLICY "nfc_programming_sessions_no_client_access" ON public.nfc_programming_sessions FOR SELECT TO anon USING (false);
CREATE POLICY "activation_attempts_no_client_access" ON public.activation_attempts FOR SELECT TO authenticated, anon USING (false);