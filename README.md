# 고전시가 현대어 풀이 연습기

고전시가나 문학 작품을 한 문장씩 직접 현대어로 풀이하며 연습할 수 있는 정적 웹 애플리케이션입니다. 이 레포는 정적 파일(HTML/JS/CSS)로 이루어져 있어 GitHub Pages 같은 정적 호스팅에 배포하기 적합합니다.

## 목차

- 프로젝트 개요
- 빠른 시작 (로컬)
- 설정(config)
- 관리자 인증(현재 임시 방식)
- 보안 권장사항
- GitHub Pages 자동 배포(권장 워크플로)
- 테스트 및 검증
- 롤백 및 운영 가이드
- 기여 및 라이선스

## 프로젝트 개요

- 사용자 목적: 원문을 문장 단위로 보면서 현대어 풀이를 작성하고, 결과를 저장/복사하여 외부 도구로 후속 처리할 수 있도록 함.
- 기술 스택: 순수 프론트엔드(모듈형 JS), Firebase Firestore(데이터 저장)와 연동 가능하도록 설계됨.

## 빠른 시작 (로컬)

1. 레포 클론:

   git clone https://github.com/Goldhobbang/classical-poetry-practice.git
   cd classical-poetry-practice

2. 정적 서버로 테스트:

   - 간단한 Python HTTP 서버 사용(개발용):
     python -m http.server 8000
     브라우저에서 http://localhost:8000 로 접속

   - Node 기반 정적 서버(선택):
     npx http-server -p 8000

3. 동작 확인:
   - `index.html`이 열리고, 원문을 입력해 연습 기능이 동작하는지 확인합니다.

## 설정 (config)

- 파일: `config/firebase-config.js`
  - 이 파일은 `.gitignore`로 관리되어 Git에 포함되지 않습니다.
  - 정적 호스팅 배포 시(예: GitHub Actions) 워크플로가 런타임에 이 파일을 생성하여 민감값이 레포지토리에 들어가지 않도록 합니다.
  - 필요한 항목(예시):

    window.__FIREBASE_CONFIG__ = {
      apiKey: "...",
      authDomain: "...",
      projectId: "...",
      storageBucket: "...",
      messagingSenderId: "...",
      appId: "...",
      measurementId: "..."
    };

    // 현재(임시) 관리자 인증 해시(클라이언트 저장) — 권장하지 않음
    window.__ADMIN_PASSWORD_HASH__ = "<SHA256_HEX>";

- 주의: Firebase의 서비스 계정 키(서버 권한)는 절대 레포에 포함하지 마세요.

## 관리자 인증 (현재 임시 방식)

- 변경 사항: 원래 `config/firebase-config.js`에 평문 `window.__ADMIN_PASSWORD__`가 들어 있던 구조를 제거했고, 대신 SHA-256 해시를 `window.__ADMIN_PASSWORD_HASH__`로 저장하도록 클라이언트 로직을 업데이트했습니다.
- 동작: 관리자는 로그인 창에 비밀번호를 입력하면 브라우저가 입력값을 SHA-256으로 해시하여 저장된 해시와 비교합니다.

중요: 이 방식은 임시 완화책이며 보안적으로 취약합니다. 가능한 빨리 아래 권장 방식으로 전환하세요.

### 권장(안전) 방식 — 꼭 전환하세요

1. Firebase Authentication(email/password) 도입
   - Firebase Console에서 관리자를 위한 계정을 생성합니다.
2. 권한 부여 방식(둘 중 하나)
   - `admins/{uid}` 같은 Firestore 컬렉션을 만들어 관리자 uid를 저장하고 클라이언트는 로그인 후 해당 문서 존재 여부로 권한을 확인합니다.
   - 또는 Firebase Admin SDK를 사용해 사용자에게 커스텀 클레임(`admin: true`)을 부여하고, 클라이언트는 `getIdTokenResult()`로 claims를 확인합니다.
3. Firestore 보안 규칙에 `request.auth != null` 및 관리자 전용 쓰기/삭제 규칙을 추가하세요.

## 보안 권장사항

- 절대 평문 비밀번호를 저장하거나 레포에 커밋하지 마세요.
- 가능하면 클라이언트가 아닌 서버(또는 Firebase Auth + custom claims)를 사용해 인증/권한을 처리하세요.
- GitHub Actions 등의 CI에 민감값을 보관할 때는 GitHub Secrets를 사용하세요.

## GitHub Pages 자동 배포(권장 워크플로 요약)

목표: main 브랜치에 푸시하면 GitHub Actions가 정적 사이트를 빌드하고 GitHub Pages로 배포합니다. 민감값(`config/firebase-config.js`)는 워크플로가 Secrets에서 읽어 파일을 생성합니다. 이 레포에는 예시 워크플로 `.github/workflows/deploy.yml`가 포함되어 있습니다.

필요한 GitHub Secrets (프로젝트 필요에 맞게 선택):
- ADMIN_PASSWORD_HASH (관리자 비밀번호의 SHA-256 헥스)
- 추가로 Firebase 설정이 필요하면 아래 값을 추가하세요:
  - FIREBASE_API_KEY
  - FIREBASE_AUTH_DOMAIN
  - FIREBASE_PROJECT_ID
  - FIREBASE_STORAGE_BUCKET
  - FIREBASE_MESSAGING_SENDER_ID
  - FIREBASE_APP_ID
  - FIREBASE_MEASUREMENT_ID (선택)

워크플로(요약 동작):
1. checkout
2. create `config/firebase-config.js` from Secrets (build-time)
3. build (if 프로젝트에 빌드 스텝이 있다면 실행)
4. deploy to GitHub Pages using peaceiris/actions-gh-pages

참고: 워크플로는 `.github/workflows/deploy.yml`에 추가되어 있으며, 기본적으로 레포 루트(`./`)를 퍼블리시 대상(publish_dir)으로 사용합니다. 필요하면 `publish_dir`를 빌드 산출물 디렉토리(예: `./build` 또는 `./dist`)로 변경하세요.

## 테스트 및 검증

- 로컬에서 정적 서버로 기능 테스트
- 관리자 로그인: 올바른 비밀번호 입력 시 관리자 버튼(수정/삭제)이 보이는지 확인
- 비관리자 접속: 수정/삭제 버튼이 보이지 않아야 하고, 보호된 작업 시 오류가 발생해야 함
- 스모크 테스트: 글 추가 → 불러오기 → 연습 → 결과 복사 시나리오 확인

## 롤백 및 운영 가이드

- 긴급 롤백: gh-pages 브랜치의 이전 커밋을 복원하거나 GitHub Pages 설정에서 특정 브랜치/커밋으로 되돌릴 수 있습니다.
- 민감 정보 유출 사고가 발생하면 즉시 비밀번호/키를 교체하고 관련 토큰을 폐기하세요.

## 기여 가이드

- 기능 개선이나 버그 수정은 develop 브랜치에서 작업한 뒤 PR을 통해 main으로 병합하세요.
- 민감 정보는 절대 커밋하지 마세요.

## 라이선스

- 이 레포는 별도 명시가 없으면 퍼블릭 용도로 사용할 수 있습니다. 필요하면 LICENSE 파일을 추가하세요.



