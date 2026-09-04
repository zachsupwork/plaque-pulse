-- 1. Private schema: not exposed through the Data API, so nothing here is RPC-callable.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- 2. Recreate the security-definer helpers inside the private schema.
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.is_business_member(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = _business_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = _business_id AND is_demo = true
  )
$$;

CREATE OR REPLACE FUNCTION private.is_business_manager(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = _business_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION private.business_has_members(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_members WHERE business_id = _business_id)
$$;

CREATE OR REPLACE FUNCTION private.business_is_demo(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses WHERE id = _business_id AND is_demo = true)
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_business_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_business_manager(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.business_has_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.business_is_demo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_business_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_business_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.business_has_members(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.business_is_demo(uuid) TO authenticated, service_role;

-- 3. Repoint every dependent policy at the private helpers (same semantics).
DROP POLICY "members manage action history" ON public.action_history;
CREATE POLICY "members manage action history" ON public.action_history AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

DROP POLICY "read own memberships" ON public.business_members;
CREATE POLICY "read own memberships" ON public.business_members AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR private.is_business_member(business_id)));

DROP POLICY "members read business" ON public.businesses;
CREATE POLICY "members read business" ON public.businesses AS PERMISSIVE FOR SELECT TO authenticated USING (private.is_business_member(id));

DROP POLICY "members update business" ON public.businesses;
CREATE POLICY "members update business" ON public.businesses AS PERMISSIVE FOR UPDATE TO authenticated USING ((private.is_business_member(id) AND (is_demo = false)));

DROP POLICY "members manage messages" ON public.conversation_messages;
CREATE POLICY "members manage messages" ON public.conversation_messages AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conversation_messages.conversation_id) AND private.is_business_member(c.business_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conversation_messages.conversation_id) AND private.is_business_member(c.business_id)))));

DROP POLICY "members manage conversations" ON public.conversations;
CREATE POLICY "members manage conversations" ON public.conversations AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

DROP POLICY "members manage destinations" ON public.destinations;
CREATE POLICY "members manage destinations" ON public.destinations AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

DROP POLICY "members read events" ON public.events;
CREATE POLICY "members read events" ON public.events AS PERMISSIVE FOR SELECT TO authenticated USING (((business_id IS NOT NULL) AND private.is_business_member(business_id)));

DROP POLICY "members manage variants" ON public.experiment_variants;
CREATE POLICY "members manage variants" ON public.experiment_variants AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM experiments e
  WHERE ((e.id = experiment_variants.experiment_id) AND private.is_business_member(e.business_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM experiments e
  WHERE ((e.id = experiment_variants.experiment_id) AND private.is_business_member(e.business_id)))));

DROP POLICY "members manage experiments" ON public.experiments;
CREATE POLICY "members manage experiments" ON public.experiments AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

DROP POLICY "members manage goals" ON public.goals;
CREATE POLICY "members manage goals" ON public.goals AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

DROP POLICY "members manage integrations" ON public.integrations;
CREATE POLICY "members manage integrations" ON public.integrations AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

DROP POLICY "members manage locations" ON public.locations;
CREATE POLICY "members manage locations" ON public.locations AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

DROP POLICY "members manage snapshots" ON public.metric_snapshots;
CREATE POLICY "members manage snapshots" ON public.metric_snapshots AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

DROP POLICY "members manage outcomes" ON public.outcomes;
CREATE POLICY "members manage outcomes" ON public.outcomes AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

DROP POLICY "members manage placement history" ON public.plaque_placement_history;
CREATE POLICY "members manage placement history" ON public.plaque_placement_history AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM plaques p
  WHERE ((p.id = plaque_placement_history.plaque_id) AND (p.business_id IS NOT NULL) AND private.is_business_member(p.business_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM plaques p
  WHERE ((p.id = plaque_placement_history.plaque_id) AND (p.business_id IS NOT NULL) AND private.is_business_member(p.business_id)))));

DROP POLICY "Admins manage programming" ON public.plaque_programming;
CREATE POLICY "Admins manage programming" ON public.plaque_programming AS PERMISSIVE FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY "Owners view their plaque programming" ON public.plaque_programming;
CREATE POLICY "Owners view their plaque programming" ON public.plaque_programming AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM plaques p
  WHERE ((p.id = plaque_programming.plaque_id) AND (p.business_id IS NOT NULL) AND private.is_business_member(p.business_id)))));

DROP POLICY "admins manage plaques" ON public.plaques;
CREATE POLICY "admins manage plaques" ON public.plaques AS PERMISSIVE FOR ALL TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY "members manage plaques" ON public.plaques;
CREATE POLICY "members manage plaques" ON public.plaques AS PERMISSIVE FOR ALL TO authenticated USING (((business_id IS NOT NULL) AND private.is_business_member(business_id))) WITH CHECK (((business_id IS NOT NULL) AND private.is_business_member(business_id)));

DROP POLICY "Admins read programming events" ON public.programming_events;
CREATE POLICY "Admins read programming events" ON public.programming_events AS PERMISSIVE FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY "Admins write programming events" ON public.programming_events;
CREATE POLICY "Admins write programming events" ON public.programming_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY "members manage recommendations" ON public.recommendations;
CREATE POLICY "members manage recommendations" ON public.recommendations AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

DROP POLICY "members manage subscriptions" ON public.subscriptions;
CREATE POLICY "members manage subscriptions" ON public.subscriptions AS PERMISSIVE FOR ALL TO authenticated USING (private.is_business_member(business_id)) WITH CHECK (private.is_business_member(business_id));

-- 4. Remove the API-exposed security definer functions.
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_business_member(uuid);

-- 5. Close the self-service ownership escalation on business_members.
DROP POLICY IF EXISTS "insert own membership" ON public.business_members;
CREATE POLICY "bootstrap or managed membership" ON public.business_members
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (
      user_id = auth.uid()
      AND role = 'owner'::public.member_role
      AND NOT private.business_has_members(business_id)
      AND NOT private.business_is_demo(business_id)
    )
    OR private.is_business_manager(business_id)
  );