-- VC Pipeline Intelligence (Problem Statement 10). All objects prefixed vc_.

create table public.vc_investors (
  id uuid primary key default gen_random_uuid(),
  -- identity
  name text not null,
  firm text not null,
  kind text not null default 'VC firm',
  thesis text not null default '',
  website text,
  geography text,
  -- Vikram's manual columns: the pipeline is never allowed to write these
  status text not null default 'not_contacted'
    check (status in ('not_contacted','waiting_response','in_conversation','passed')),
  last_contact_date date,
  notes text not null default '',
  -- signal-derived columns: the ONLY columns the pipeline writes
  last_signal_date date,
  signal_summary text,
  follow_up_score int check (follow_up_score between 0 and 100),
  recommended_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.vc_investors is 'Vikram''s VC pipeline. Pipeline writes only last_signal_date, signal_summary, follow_up_score, recommended_action (enforced by trigger vc_guard_columns).';

create table public.vc_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron','manual')),
  status text not null default 'running' check (status in ('running','succeeded','partial','failed','stalled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  heartbeat_at timestamptz not null default now(),
  total int not null default 0,
  processed int not null default 0,
  active_count int not null default 0,
  quiet_count int not null default 0,
  error_count int not null default 0,
  gemini_calls int not null default 0,
  fingerprint_before text,
  fingerprint_after text,
  manual_edits_during_run int not null default 0,
  model text,
  notes text
);

create table public.vc_assessments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.vc_runs(id) on delete cascade,
  investor_id uuid not null references public.vc_investors(id) on delete cascade,
  state text not null check (state in ('active','quiet','error')),
  score int,
  prev_score int,
  breakdown jsonb,
  best_signal jsonb,
  signals jsonb not null default '[]'::jsonb,
  rejected jsonb not null default '[]'::jsonb,
  why text,
  opening_line text,
  action text,
  error text,
  created_at timestamptz not null default now(),
  unique (run_id, investor_id)
);
create index vc_assessments_investor_idx on public.vc_assessments(investor_id, created_at desc);

create table public.vc_manual_edits (
  id bigint generated always as identity primary key,
  investor_id uuid not null references public.vc_investors(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  edited_at timestamptz not null default now()
);

alter table public.vc_investors enable row level security;
alter table public.vc_runs enable row level security;
alter table public.vc_assessments enable row level security;
alter table public.vc_manual_edits enable row level security;
-- No policies: only the server (secret key) can read/write.

-- Column guard: who is writing is declared per transaction via set_config('vc.writer', ...)
create or replace function public.vc_guard_columns() returns trigger
language plpgsql set search_path = public as $$
declare w text := coalesce(current_setting('vc.writer', true), '');
begin
  if w = 'pipeline' and (
       new.name is distinct from old.name or new.firm is distinct from old.firm
    or new.kind is distinct from old.kind or new.thesis is distinct from old.thesis
    or new.website is distinct from old.website or new.geography is distinct from old.geography
    or new.status is distinct from old.status
    or new.last_contact_date is distinct from old.last_contact_date
    or new.notes is distinct from old.notes) then
    raise exception 'VC_GUARD: the signal pipeline may only write last_signal_date, signal_summary, follow_up_score, recommended_action';
  end if;
  if w = 'manual' and (
       new.last_signal_date is distinct from old.last_signal_date
    or new.signal_summary is distinct from old.signal_summary
    or new.follow_up_score is distinct from old.follow_up_score
    or new.recommended_action is distinct from old.recommended_action) then
    raise exception 'VC_GUARD: signal columns are written by the pipeline only';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger vc_guard_columns before update on public.vc_investors
for each row execute function public.vc_guard_columns();

-- Pipeline write path: exactly four columns.
create or replace function public.vc_apply_signal(
  p_id uuid, p_last_signal_date date, p_summary text, p_score int, p_action text)
returns void language plpgsql set search_path = public as $$
begin
  perform set_config('vc.writer', 'pipeline', true);
  update vc_investors set
    last_signal_date = p_last_signal_date,
    signal_summary = p_summary,
    follow_up_score = p_score,
    recommended_action = p_action
  where id = p_id;
end $$;

-- Vikram's write path: manual columns only, with an edit log.
create or replace function public.vc_update_manual(
  p_id uuid, p_status text, p_last_contact_date date, p_notes text)
returns void language plpgsql set search_path = public as $$
declare o vc_investors;
begin
  select * into o from vc_investors where id = p_id for update;
  if not found then raise exception 'investor not found'; end if;
  perform set_config('vc.writer', 'manual', true);
  update vc_investors set status = p_status, last_contact_date = p_last_contact_date, notes = p_notes
  where id = p_id;
  if o.status is distinct from p_status then
    insert into vc_manual_edits(investor_id, field, old_value, new_value) values (p_id, 'status', o.status, p_status); end if;
  if o.last_contact_date is distinct from p_last_contact_date then
    insert into vc_manual_edits(investor_id, field, old_value, new_value) values (p_id, 'last_contact_date', o.last_contact_date::text, p_last_contact_date::text); end if;
  if o.notes is distinct from p_notes then
    insert into vc_manual_edits(investor_id, field, old_value, new_value) values (p_id, 'notes', o.notes, p_notes); end if;
end $$;

-- Fingerprint of every manual column, taken before and after each run.
create or replace function public.vc_manual_fingerprint() returns text
language sql stable set search_path = public as $$
  select md5(coalesce(string_agg(
    id::text || '|' || status || '|' || coalesce(last_contact_date::text,'') || '|' || notes, '#' order by id), ''))
  from vc_investors
$$;

-- Live proof: try to overwrite a note as the pipeline and report what the database does.
create or replace function public.vc_guard_selftest() returns jsonb
language plpgsql set search_path = public as $$
declare v_id uuid; v_firm text; v_before text; v_after text; v_err text;
begin
  select id, firm, notes into v_id, v_firm, v_before from vc_investors order by firm limit 1;
  begin
    perform set_config('vc.writer', 'pipeline', true);
    update vc_investors set notes = 'OVERWRITTEN BY PIPELINE' where id = v_id;
    raise exception 'VC_SELFTEST_NOT_BLOCKED';
  exception when others then
    v_err := sqlerrm;
  end;
  perform set_config('vc.writer', '', true);
  select notes into v_after from vc_investors where id = v_id;
  return jsonb_build_object(
    'investor', v_firm,
    'blocked', v_err like 'VC_GUARD%',
    'database_said', v_err,
    'note_unchanged', v_before is not distinct from v_after,
    'tested_at', now());
end $$;

revoke all on function public.vc_apply_signal(uuid,date,text,int,text) from public, anon, authenticated;
revoke all on function public.vc_update_manual(uuid,text,date,text) from public, anon, authenticated;
revoke all on function public.vc_manual_fingerprint() from public, anon, authenticated;
revoke all on function public.vc_guard_selftest() from public, anon, authenticated;
grant execute on function public.vc_apply_signal(uuid,date,text,int,text) to service_role;
grant execute on function public.vc_update_manual(uuid,text,date,text) to service_role;
grant execute on function public.vc_manual_fingerprint() to service_role;
grant execute on function public.vc_guard_selftest() to service_role;
