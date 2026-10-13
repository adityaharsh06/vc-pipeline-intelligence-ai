-- Gemini-drafted outreach emails, cached per assessment (signal) and tone. Drafts only: the app never sends email.
create table public.vc_outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.vc_investors(id) on delete cascade,
  assessment_id uuid not null references public.vc_assessments(id) on delete cascade,
  kind text not null check (kind in ('first_touch','follow_up','next_step')),
  tone text not null default 'default' check (tone in ('default','shorter','warmer','formal')),
  subject text not null,
  body text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (assessment_id, tone)
);
create index vc_outreach_drafts_created_idx on public.vc_outreach_drafts(created_at desc);
alter table public.vc_outreach_drafts enable row level security;
-- No policies: server-only access with the secret key.
