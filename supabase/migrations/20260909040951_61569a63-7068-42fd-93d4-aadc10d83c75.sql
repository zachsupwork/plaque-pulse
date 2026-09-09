create policy "Deny direct client access to area batches"
on public.area_batches
for all
to anon, authenticated
using (false)
with check (false);

create policy "Deny direct client access to area prospects"
on public.area_prospects
for all
to anon, authenticated
using (false)
with check (false);

create policy "Deny direct client access to area searches"
on public.area_searches
for all
to anon, authenticated
using (false)
with check (false);