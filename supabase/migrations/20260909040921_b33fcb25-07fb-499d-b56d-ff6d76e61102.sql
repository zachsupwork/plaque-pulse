create policy "Deny direct client access to SmartLink requests"
on public.smartlink_requests
for all
to anon, authenticated
using (false)
with check (false);

create policy "Deny direct client access to SmartLink failures"
on public.smartlink_failures
for all
to anon, authenticated
using (false)
with check (false);