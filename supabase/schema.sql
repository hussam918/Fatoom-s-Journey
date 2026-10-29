-- رحلة فاطمة: schema for Supabase Postgres.
-- Run once in Supabase SQL Editor before creating the family profiles.

create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'رحلة فاطمة',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  role text not null check (role in ('parent', 'child')),
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text check (description is null or char_length(description) <= 180),
  stars integer not null default 1 check (stars between 1 and 100),
  cadence text not null default 'daily' check (cadence in ('daily', 'once')),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete restrict,
  child_id uuid not null references public.profiles(user_id) on delete cascade,
  task_date date not null default (now() at time zone 'Asia/Riyadh')::date,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  stars_awarded integer not null default 0 check (stars_awarded >= 0),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references auth.users(id) on delete set null
);

create unique index if not exists one_open_or_approved_completion_per_day
  on public.task_completions (task_id, child_id, task_date)
  where status in ('pending', 'approved');
create index if not exists task_completions_family_date_idx
  on public.task_completions (family_id, task_date desc);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 180),
  stars_cost integer not null check (stars_cost between 1 and 1000),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.profiles(user_id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  stars_cost integer not null default 0 check (stars_cost >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references auth.users(id) on delete set null
);
create unique index if not exists one_pending_request_per_reward
  on public.reward_requests (reward_id, child_id) where status = 'pending';
create index if not exists reward_requests_family_date_idx
  on public.reward_requests (family_id, requested_at desc);

-- Keep open devices in sync as tasks, reviews, and reward requests change.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['tasks', 'task_completions', 'rewards', 'reward_requests'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

create or replace function public.my_family_id()
returns uuid
language sql stable security definer
set search_path = public
as $$ select family_id from public.profiles where user_id = auth.uid() limit 1 $$;

create or replace function public.my_role()
returns text
language sql stable security definer
set search_path = public
as $$ select role from public.profiles where user_id = auth.uid() limit 1 $$;

grant execute on function public.my_family_id() to authenticated;
grant execute on function public.my_role() to authenticated;
revoke all on function public.my_family_id() from public, anon;
revoke all on function public.my_role() from public, anon;

alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_requests enable row level security;

-- Remove any platform default grants before adding the minimum privileges
-- required by this app. RLS policies below then constrain the accessible rows.
revoke all privileges on table
  public.families,
  public.profiles,
  public.tasks,
  public.task_completions,
  public.rewards,
  public.reward_requests
from public, anon, authenticated;

grant select on public.families, public.profiles to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert, update on public.task_completions to authenticated;
grant select, insert, update on public.rewards to authenticated;
grant select, insert, update on public.reward_requests to authenticated;

drop policy if exists "family members can read their family" on public.families;
create policy "family members can read their family" on public.families
  for select to authenticated using (id = public.my_family_id());

drop policy if exists "family members can read profiles" on public.profiles;
create policy "family members can read profiles" on public.profiles
  for select to authenticated using (family_id = public.my_family_id());

drop policy if exists "members can read active family tasks" on public.tasks;
create policy "members can read active family tasks" on public.tasks
  for select to authenticated using (family_id = public.my_family_id() and (active or public.my_role() = 'parent'));
drop policy if exists "parents can add tasks" on public.tasks;
create policy "parents can add tasks" on public.tasks
  for insert to authenticated with check (family_id = public.my_family_id() and public.my_role() = 'parent' and created_by = auth.uid());
drop policy if exists "parents can update tasks" on public.tasks;
create policy "parents can update tasks" on public.tasks
  for update to authenticated using (family_id = public.my_family_id() and public.my_role() = 'parent')
  with check (family_id = public.my_family_id() and public.my_role() = 'parent');

drop policy if exists "members can read family completions" on public.task_completions;
create policy "members can read family completions" on public.task_completions
  for select to authenticated using (family_id = public.my_family_id() and (public.my_role() = 'parent' or child_id = auth.uid()));
drop policy if exists "children can submit their completion" on public.task_completions;
create policy "children can submit their completion" on public.task_completions
  for insert to authenticated with check (
    family_id = public.my_family_id() and child_id = auth.uid() and public.my_role() = 'child'
    and status = 'pending' and stars_awarded = 0
    and exists (select 1 from public.tasks t where t.id = task_completions.task_id and t.family_id = task_completions.family_id and t.active)
  );
drop policy if exists "parents can review family completions" on public.task_completions;
create policy "parents can review family completions" on public.task_completions
  for update to authenticated using (family_id = public.my_family_id() and public.my_role() = 'parent' and status = 'pending')
  with check (family_id = public.my_family_id() and public.my_role() = 'parent' and status in ('approved', 'rejected'));

drop policy if exists "members can read active family rewards" on public.rewards;
create policy "members can read active family rewards" on public.rewards
  for select to authenticated using (family_id = public.my_family_id() and (active or public.my_role() = 'parent'));
drop policy if exists "parents can add rewards" on public.rewards;
create policy "parents can add rewards" on public.rewards
  for insert to authenticated with check (family_id = public.my_family_id() and public.my_role() = 'parent' and created_by = auth.uid());
drop policy if exists "parents can update rewards" on public.rewards;
create policy "parents can update rewards" on public.rewards
  for update to authenticated using (family_id = public.my_family_id() and public.my_role() = 'parent')
  with check (family_id = public.my_family_id() and public.my_role() = 'parent');

drop policy if exists "members can read their family reward requests" on public.reward_requests;
create policy "members can read their family reward requests" on public.reward_requests
  for select to authenticated using (family_id = public.my_family_id() and (public.my_role() = 'parent' or child_id = auth.uid()));
drop policy if exists "children can request a family reward" on public.reward_requests;
create policy "children can request a family reward" on public.reward_requests
  for insert to authenticated with check (
    family_id = public.my_family_id() and child_id = auth.uid() and public.my_role() = 'child'
    and status = 'pending'
    and exists (select 1 from public.rewards r where r.id = reward_requests.reward_id and r.family_id = reward_requests.family_id and r.active)
  );
drop policy if exists "parents can review family reward requests" on public.reward_requests;
create policy "parents can review family reward requests" on public.reward_requests
  for update to authenticated using (family_id = public.my_family_id() and public.my_role() = 'parent' and status = 'pending')
  with check (family_id = public.my_family_id() and public.my_role() = 'parent' and status in ('approved', 'rejected'));

create or replace function public.protect_completion_review()
returns trigger language plpgsql security definer set search_path = public
as $$
declare task_stars integer;
begin
  if tg_op = 'INSERT' then
    if new.child_id <> auth.uid() or public.my_role() <> 'child' then raise exception 'Only the child can submit their own completion'; end if;
    select stars into task_stars from public.tasks where id = new.task_id and family_id = new.family_id and active;
    if task_stars is null then raise exception 'Task is unavailable'; end if;
    new.status := 'pending'; new.stars_awarded := 0; new.reviewer_id := null; new.reviewed_at := null;
    return new;
  end if;
  if public.my_role() <> 'parent' or new.status not in ('approved', 'rejected') or old.status <> 'pending' then raise exception 'Invalid completion review'; end if;
  new.family_id := old.family_id; new.task_id := old.task_id; new.child_id := old.child_id;
  new.task_date := old.task_date; new.submitted_at := old.submitted_at;
  new.reviewer_id := auth.uid(); new.reviewed_at := now();
  if new.status = 'approved' then
    select stars into task_stars from public.tasks where id = old.task_id;
    new.stars_awarded := coalesce(task_stars, 0);
  else
    new.stars_awarded := 0;
  end if;
  return new;
end $$;

drop trigger if exists protect_completion_review on public.task_completions;
create trigger protect_completion_review before insert or update on public.task_completions
  for each row execute function public.protect_completion_review();
revoke all on function public.protect_completion_review() from public, anon, authenticated;

create or replace function public.protect_reward_request()
returns trigger language plpgsql security definer set search_path = public
as $$
declare cost integer; earned integer; spent integer;
begin
  if tg_op = 'INSERT' then
    if new.child_id <> auth.uid() or public.my_role() <> 'child' then raise exception 'Only the child can request a reward'; end if;
    select stars_cost into cost from public.rewards where id = new.reward_id and family_id = new.family_id and active;
    if cost is null then raise exception 'Reward is unavailable'; end if;
    select coalesce(sum(stars_awarded), 0) into earned from public.task_completions where child_id = new.child_id and status = 'approved';
    select coalesce(sum(stars_cost), 0) into spent from public.reward_requests where child_id = new.child_id and status = 'approved';
    if earned - spent < cost then raise exception 'Not enough stars'; end if;
    new.stars_cost := cost; new.status := 'pending'; new.reviewer_id := null; new.reviewed_at := null;
    return new;
  end if;
  if public.my_role() <> 'parent' or new.status not in ('approved', 'rejected') or old.status <> 'pending' then raise exception 'Invalid reward review'; end if;
  new.family_id := old.family_id; new.child_id := old.child_id; new.reward_id := old.reward_id;
  new.stars_cost := old.stars_cost; new.requested_at := old.requested_at;
  if new.status = 'approved' then
    select coalesce(sum(stars_awarded), 0) into earned from public.task_completions where child_id = old.child_id and status = 'approved';
    select coalesce(sum(stars_cost), 0) into spent from public.reward_requests where child_id = old.child_id and status = 'approved';
    if earned - spent < old.stars_cost then raise exception 'Not enough stars'; end if;
  end if;
  new.reviewer_id := auth.uid(); new.reviewed_at := now();
  return new;
end $$;

drop trigger if exists protect_reward_request on public.reward_requests;
create trigger protect_reward_request before insert or update on public.reward_requests
  for each row execute function public.protect_reward_request();
revoke all on function public.protect_reward_request() from public, anon, authenticated;

-- One-time family setup, after creating the two email/password users under
-- Supabase Dashboard > Authentication > Users. Replace both UUID placeholders.
-- Run this block in the SQL Editor as the project owner.
--
-- with new_family as (
--   insert into public.families (name, created_by)
--   values ('رحلة فاطمة', 'PARENT_AUTH_USER_UUID'::uuid)
--   returning id
-- )
-- insert into public.profiles (user_id, family_id, role, display_name)
-- select 'PARENT_AUTH_USER_UUID'::uuid, id, 'parent', 'ولي الأمر' from new_family
-- union all
-- select 'CHILD_AUTH_USER_UUID'::uuid, id, 'child', 'فاطمة' from new_family;

