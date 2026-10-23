-- Run this ONCE in Supabase -> SQL Editor -> New query -> Run
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  tokens integer not null default 25 check (tokens >= 0),
  plan text not null default 'free',
  plan_status text,
  ls_subscription_id text,
  ls_customer_id text,
  renews_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_sub_idx on public.profiles (ls_subscription_id);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

create table if not exists public.billing_events (
  id text primary key,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;

-- every new account automatically gets 25 free tokens
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, tokens) values (new.id, new.email, 25) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- atomic: returns remaining tokens, or -1 if none left
create or replace function public.consume_token(uid uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare r integer;
begin
  update public.profiles set tokens = tokens - 1 where id = uid and tokens > 0 returning tokens into r;
  if r is null then return -1; end if;
  return r;
end $$;

create or replace function public.add_tokens(uid uuid, n integer) returns integer
language plpgsql security definer set search_path = public as $$
declare r integer;
begin
  update public.profiles set tokens = greatest(tokens + n, 0) where id = uid returning tokens into r;
  return coalesce(r, -1);
end $$;

revoke all on function public.consume_token(uuid) from public, anon, authenticated;
revoke all on function public.add_tokens(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_token(uuid) to service_role;
grant execute on function public.add_tokens(uuid, integer) to service_role;
