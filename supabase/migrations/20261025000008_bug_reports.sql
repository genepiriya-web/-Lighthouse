-- Level 1 bug reporting (Gene, 25 Oct 2026): the Feedback button gains a type and automatic details, and each report is
-- announced in Discord. Discord gets no customer data: type, page, department and a link back — the text only if
-- DISCORD_INCLUDE_TEXT=1. A report is always saved first; Discord delivery is retried until it succeeds.
alter table feedback
  add column kind        text not null default 'other' check (kind in ('bug','confusing','idea','other')),
  add column meta        jsonb,                -- browser, screen size, language, recent errors the screen saw
  add column notified_at timestamptz,
  add column notify_error text,
  add column notify_tries integer not null default 0;
create index feedback_unsent_idx on feedback (at) where notified_at is null;
