# 제이로지스 구직자 관리 시스템 (Supabase 연동)

PC·핸드폰 어디서 접속하든 같은 데이터를 보고 수정할 수 있는 클라우드 동기화 버전입니다.

## 설치 & 실행 순서

### 1단계 — Supabase 프로젝트 준비
1. [supabase.com](https://supabase.com) 로그인 → 새 프로젝트 생성
2. 좌측 **SQL Editor** 열기
3. `supabase-setup.sql` 내용을 붙여넣고 **RUN** 실행
   - (재실행 시 `42710` 정책 에러가 떠도 무해합니다. 이 SQL은 `drop policy if exists`로 멱등 처리되어 있습니다.)
4. **실시간 동기화**를 쓰려면: Database → Replication → `applicants`, `calls` 테이블 토글 ON

### 2단계 — 키 값 복사
Supabase 대시보드 → Project Settings → **API** 에서:
- `Project URL`
- `anon public` 키

### 3단계 — 환경변수 설정
`.env.example`을 복사해 `.env` 파일을 만들고 값 입력:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### 4단계 — 로컬 실행
```bash
npm install
npm run dev
```

## 핸드폰 배포 (Vercel 추천)
1. 이 폴더를 GitHub 저장소에 올림
2. [vercel.com](https://vercel.com) → Import Project → 저장소 선택
3. **Environment Variables**에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 두 개 입력
4. Deploy → 발급된 주소(`https://xxx.vercel.app`)를 핸드폰 브라우저에서 열기
5. 핸드폰: 공유 → **홈 화면에 추가** 하면 앱 아이콘처럼 사용 가능

> StackBlitz/CodeSandbox에 붙여넣어 바로 테스트하려면, 그 환경에서는 `.env` 대신 각 서비스의 환경변수 설정 UI에 키를 넣으세요.

## 주요 기능
- 지원자 등록/검색/단계별 필터
- 채용 단계: 서류접수 → 전화상담 → 면접 → 동승심사 → 채용완료 (단계바 클릭으로 변경)
- 통화 이력 기록 (일자/결과/메모/다음 액션)
- 모든 기기 간 실시간 동기화

## 보안 참고
현재 RLS 정책은 사내 도구용으로 anon 키에 전체 접근을 허용합니다.
외부에 공개하거나 보안을 강화하려면 Supabase Auth(로그인) 기반 정책으로 교체하세요.
