-- #2 Warm-up kit: LinkedIn note + warm-intro request per "tailored note" VC, cached per assessment.
create table public.vc_warmup_drafts (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.vc_investors(id) on delete cascade,
  assessment_id uuid not null unique references public.vc_assessments(id) on delete cascade,
  linkedin_note text not null,
  intro_subject text not null,
  intro_body text not null,
  model text,
  created_at timestamptz not null default now()
);
create index vc_warmup_drafts_created_idx on public.vc_warmup_drafts(created_at desc);
alter table public.vc_warmup_drafts enable row level security;

-- #4 Manage pipeline: investors added from the app are marked so only they can be removed from the app.
alter table public.vc_investors add column source text not null default 'seed' check (source in ('seed','added'));

-- A single-investor scan right after adding someone (not a full refresh).
alter table public.vc_runs drop constraint vc_runs_trigger_check;
alter table public.vc_runs add constraint vc_runs_trigger_check check (trigger in ('cron','manual','single'));
