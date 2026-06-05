-- ============================================================
-- 제이로지스 구직자 관리 시스템 - Supabase 테이블 설정
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- 여러 번 실행해도 안전합니다 (멱등 처리).
-- ============================================================

-- 1) 지원자 테이블 ------------------------------------------------
create table if not exists public.applicants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null,
  region      text default '',
  position    text default '새벽수거',
  referrer    text default '',
  stage       text default '서류접수',
  note        text default '',
  created_at  timestamptz default now()
);

-- 2) 통화 이력 테이블 --------------------------------------------
create table if not exists public.calls (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid not null references public.applicants(id) on delete cascade,
  call_date     date default current_date,
  result        text default '연결됨',
  memo          text default '',
  next_action   text default '',
  created_at    timestamptz default now()
);

create index if not exists idx_calls_applicant on public.calls(applicant_id);
create index if not exists idx_applicants_stage on public.applicants(stage);

-- 3) RLS 활성화 --------------------------------------------------
alter table public.applicants enable row level security;
alter table public.calls      enable row level security;

-- 4) 정책 (멱등: 재실행 시 42710 에러 방지) ----------------------
-- 익명 키(anon)로 전체 접근 허용. 내부 사내 도구용 설정입니다.
-- 외부 공개 시에는 인증 기반 정책으로 교체하세요.

drop policy if exists "applicants_all" on public.applicants;
create policy "applicants_all" on public.applicants
  for all using (true) with check (true);

drop policy if exists "calls_all" on public.calls;
create policy "calls_all" on public.calls
  for all using (true) with check (true);
