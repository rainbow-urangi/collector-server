
# Rainbow extension — Backend
# collector-server

Rainbow Recorder에서 전송한 batched 이벤트를 받아 MariaDB에 저장하는 백엔드 서버입니다.  
로컬 또는 VM 환경에서 Docker 기반으로 실행하고 검증하는 것을 기준으로 사용합니다.

본 저장소는 **이벤트 ingest, 기본 조회 API, smoke 검증 환경 제공**에 목적이 있습니다.

---

## 🚀 Features

* Batch ingest endpoint (`POST /ingest/batch`)
* Health check (`GET /healthz`)
* Process visualization API (`/api/processes`)
* MariaDB 기반 직접 적재
* `text/plain` / JSON body 지원
* `x-api-key` header 및 `api_key` query 지원
* 서버 설정형 runtime config (`GET /collector/runtime-config`)
* 자체 호스팅 CRX 업데이트 manifest (`GET /extension/update/:customer/:channel/updates.xml`)
* 서버 측 데이터 품질 가드 및 품질 메타 주입
* Docker 기반 smoke CI 지원

---

## 📁 Project Structure

```text
.
├── .github/workflows/
│   ├── collector-server-ci.yml
│   └── collector-server-cd.yml
├── ci/
│   ├── compose.smoke.yml
│   ├── init-mariadb.sql
│   └── test.env
├── Dockerfile
├── package.json
├── server.js
└── README.md
```

---

## 🔧 Requirements

* Node.js 18+
* npm
* MariaDB
* Docker / Docker Compose

---

## 📦 Installation

```bash
npm install
```

---

## ⚙️ Configuration

`.env` 파일을 생성하고 아래 값을 설정합니다.

예시:

```env
PORT=8080
TRUST_PROXY=0
API_KEY=local-dev-test-key-12345
TEST_API_KEY=test_key
TEST_TENANT_ID=test_company
COLLECTOR_DB_ENV=production

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=backend_admin
DB_PASSWORD=Back@end#01!
DB_DATABASE=ingest_backend_db
DB_CONN_LIMIT=10

TEST_DB_HOST=127.0.0.1
TEST_DB_PORT=3307
TEST_DB_USER=backend_admin
TEST_DB_PASSWORD=replace-in-local-env-only
TEST_DB_DATABASE=ingest_backend_db
TEST_DB_CONN_LIMIT=5

TASK_NAME=SessionFlow
WORKFLOW_IDLE_MS=120000
API_PATH_MAX=1024
COLLECTOR_RUNTIME_CONFIG_VERSION=quality-runtime-v1
COLLECTOR_RUNTIME_CONFIG_TTL_MS=300000
COLLECTOR_MAX_TEXT_BYTES=60000
COLLECTOR_MAX_RESPONSE_BODY_BYTES=200000
```

주요 설정:

* `API_KEY`: ingest 인증 키
* `TEST_API_KEY`: 테스트 DB로만 저장할 테스트 인증 키
* `TENANT_KEYS`: 운영 키와 운영 테넌트의 JSON 매핑
* `TEST_TENANT_KEYS`: 테스트 키와 테스트 테넌트의 JSON 매핑
* `COLLECTOR_DB_ENV`: 기존 `DB_*`가 가리키는 환경 (`production` 기본값 또는 `test`)
* `DB_*`: MariaDB 연결 정보
* `TEST_DB_*`: 기본 환경이 운영일 때 사용할 테스트 MariaDB 연결 정보
* `PROD_DB_*`: 기본 환경이 테스트일 때 사용할 운영 MariaDB 연결 정보
* `DB_DATABASE`: 대상 데이터베이스 이름
* `TASK_NAME`: 기본 task 이름
* `WORKFLOW_IDLE_MS`: workflow 분리 기준 시간(ms)
* `COLLECTOR_RUNTIME_CONFIG_VERSION`: extension이 이벤트에 남길 서버 설정 버전
* `COLLECTOR_RUNTIME_CONFIG_TTL_MS`: extension runtime config 캐시 시간(ms)
* `COLLECTOR_RUNTIME_MODULES_JSON`: 서버에서 내려줄 모듈 설정 JSON
* `COLLECTOR_RUNTIME_PRIVACY_JSON`: 마스킹/제외/byte 제한 정책 JSON
* `COLLECTOR_RUNTIME_QUALITY_JSON`: 품질 가드 정책 JSON
* `COLLECTOR_RUNTIME_WORKFLOW_RULES_JSON`: workflow rule 배열 JSON
* `COLLECTOR_MAX_TEXT_BYTES`: 텍스트 필드 품질 플래그 기준 byte
* `COLLECTOR_MAX_RESPONSE_BODY_BYTES`: API 응답 본문 품질 플래그 기준 byte
* `COLLECTOR_EXTENSION_RELEASES_PATH`: CRX 업데이트 release catalog 경로
* `COLLECTOR_EXTENSION_CRX_DIR`: CRX 파일 저장 디렉터리
* `COLLECTOR_EXTENSION_UPDATE_BASE_URL`: updates.xml이 반환할 CRX 다운로드 base URL

`content.js`와 `background.js`를 변경하지 않는 운영에서는 서버가 JS 코드를 내려보내지
않고 JSON 설정만 배포합니다. 수집 방식 자체는 extension에 내장된 범위 안에서 동작하며,
서버는 `modules`, `workflow_rules`, `privacy`, `quality` 정책을 내려주고 ingest 단계에서
누락/보정/과대 payload 여부를 `locators_json.analysis.server_quality_guard`에 추가합니다.
이 값은 기존 raw 필드를 덮어쓰지 않는 분석용 메타데이터입니다.

### Extension CRX Auto Update

Chrome Enterprise 정책으로 설치된 사내 배포용 extension은 서버의 update manifest를 통해
자동 업데이트할 수 있습니다. 서버가 사용자 PC로 직접 push하는 방식이 아니라 Chrome이
`updates.xml`을 주기적으로 pull하고, 더 높은 버전의 CRX를 발견하면 다운로드합니다.

로컬 패키징 예시:

```bash
npm run package:extension
```

확장은 `config.local.js`나 `COLLECTOR_PROD_KEY` 없이 패키징할 수 있습니다. 최초 실행 시
설치 ID를 생성하고 `/ingest/batch?bootstrap=device-token`에서 만료형 장치 토큰을 자동으로
발급받아 `chrome.storage.local`에 저장합니다. 이 토큰은 운영 환경으로 라우팅되며 기존
`API_KEY` 인증도 호환을 위해 계속 지원합니다.

주요 산출물:

```text
extension-updates/
├── releases.json
├── updates.xml
├── metadata.json
├── extension-install-forcelist.json
├── extension-settings.policy.json
├── crx/
│   └── rainbow-collector-<version>.crx
├── native-host/
│   ├── RainbowNetworkHost.cs
│   ├── install-native-host.ps1
│   ├── install-production.ps1
│   └── uninstall-native-host.ps1
└── private/
    └── rainbow-collector.pem
```

`private/*.pem`은 extension ID를 결정하는 서명키이므로 Git에 올리면 안 됩니다.
운영에서는 Secret Manager, HSM, 오프라인 서명 저장소 중 하나로 관리해야 합니다.

각 Windows 수집 PC에서는 CRX 설치 후 다음 스크립트를 한 번 실행해야 정확한 로컬
IPv4가 수집됩니다.

```powershell
.\extension-updates\native-host\install-production.ps1
```

업데이트 라우트:

```text
GET /extension/update/:customer/:channel/updates.xml
GET /extension/update/:channel/updates.xml
GET /extension/crx/:file
GET /extension/update/healthz
```

Enterprise 정책 예시는 패키징 후 `extension-settings.policy.json`과
`extension-install-forcelist.json`에 생성됩니다. 권장 방식은 `ExtensionSettings`에서
`installation_mode=force_installed`, `update_url`, `override_update_url=true`를 지정하는
방식입니다.

---

## 🗄 Database

이 서버는 `ingest_backend_db` 호환 스키마를 기준으로 동작합니다.

API 키와 DB 환경은 서버에서만 매핑합니다. `test_key`를 `TEST_API_KEY` 또는
`TEST_TENANT_KEYS`에 등록하면 테스트 DB로만 저장되며, 운영 키는 기존
`API_KEY` 또는 `TENANT_KEYS`를 통해 운영 DB로 저장됩니다. 같은 키를 양쪽
환경에 등록하면 서버가 시작되지 않습니다.

주요 테이블:

* `sessions`
* `steps`
* `tasks`
* `events`
* `snapshots`

> `ci/init-mariadb.sql`은 smoke 검증용 최소 스키마입니다.  
> 실제 운영/리허설 환경에서는 별도로 준비된 `ingest_backend_db` 호환 스키마를 사용합니다.

---

## ▶️ Starting the Server

로컬 실행:

```bash
npm start
```

개발 모드:

```bash
npm run dev
```

서버가 정상적으로 실행되면 예시 로그가 출력됩니다:

```text
direct ingest listening :8080
```

---

## 🐳 Run With Docker

이미지 빌드:

```bash
docker build -t collector-server:local .
```

컨테이너 실행:

```bash
docker run --rm \
  -p 8080:8080 \
  --env-file .env \
  collector-server:local
```

MariaDB가 다른 컨테이너에서 실행 중이면 `DB_HOST`는 해당 컨테이너 이름 또는 네트워크 alias를 사용해야 합니다.

---

## 📡 API Endpoints

### **POST /ingest/batch**

batched 이벤트를 받아 DB에 적재하는 엔드포인트입니다.

인증 방식:

* `x-api-key` header
* 또는 `api_key` query parameter

지원 body:

* `application/json`
* `text/plain` 안의 JSON 문자열

#### **Request Example**

```bash
curl -X POST "http://127.0.0.1:8080/ingest/batch?api_key=local-dev-test-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"AZ_event_id":"sample-1","AZ_event_time":"2026-03-24 17:30:00.000000","AZ_event_action":"page_view","AZ_element_type":"page","AZ_url":"https://example.com","AZ_page_title":"Example","AZ_session_page_id":"sample-session-1","AZ_session_browser_id":"sample-browser-1","AZ_login_id":"sample-user-1"}]}'
```

#### **Response Example**

```json
{
  "ok": true,
  "inserted_events": 1,
  "inserted_snapshots": 0
}
```

---

### **GET /healthz**

서버 상태 확인

```json
{ "ok": true }
```

---

### **Process APIs**

* `GET /api/processes`
* `POST /api/processes/:id/sync`
* `PUT /api/processes/:id/save-layout`
* `GET /api/processes/:id/config`

---

## 🧪 Smoke Test

이 저장소는 Docker 기반 smoke 검증 구성을 포함합니다.

검증 흐름:

1. MariaDB와 collector-server를 compose로 기동
2. `/healthz` 확인
3. smoke ingest 요청 전송
4. DB insert 확인

관련 파일:

* `.github/workflows/collector-server-ci.yml`
* `ci/compose.smoke.yml`
* `ci/init-mariadb.sql`
* `ci/test.env`

---

## 🛠 Development Notes

* 이 서버는 raw event 적재를 우선으로 동작합니다.
* workflow 관련 값은 기존 session/task 구조를 대체하지 않고 분석용 힌트로 추가 저장합니다.
* 로컬 또는 VM 환경에서 Docker 기반으로 실행하고 검증하는 것을 기준으로 사용합니다.
* 원격 registry 배포 전제는 두지 않습니다.

---

## 📄 License

Internal Use

