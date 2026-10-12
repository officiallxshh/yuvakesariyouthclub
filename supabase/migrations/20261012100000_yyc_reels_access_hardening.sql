drop policy if exists yyc_reels_deny_direct_client_access on public.yyc_reels;
create policy yyc_reels_deny_direct_client_access
on public.yyc_reels
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all on function public.yyc_reels_admin_authorized(text) from public, anon, authenticated;
grant execute on function public.yyc_reels_admin_authorized(text) to service_role;