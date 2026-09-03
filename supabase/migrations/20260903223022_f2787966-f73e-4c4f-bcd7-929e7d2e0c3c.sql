revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_business_member(uuid) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_business_member(uuid) to authenticated, service_role;