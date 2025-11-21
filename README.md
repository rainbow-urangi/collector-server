
# Rainbow extension — Backend

간단한 이벤트 수집용 서버입니다.
클라이언트(웹/브라우저 확장 프로그램 등)에서 전송한 batched 이벤트를 받아 데이터베이스에 저장합니다.

본 저장소는 **데이터 포맷 정의 및 기본 수집 엔드포인트 제공**에 목적이 있으며,
실제 데이터 처리 로직 및 저장 구조는 프로젝트 사양에 따라 별도 구성합니다.

---

## 🚀 Features

* Lightweight Express server
* Batch ingest endpoint (`POST /ingest/batch`)
* Basic security headers (helmet)
* CORS 및 JSON Body 지원
* Environment-based configuration
* Health check 지원 (`GET /healthz`)

---

## 📁 Project Structure

```
.
├── server.js      # Main server
├── package.json
└── .env (you create)
```

---

## 🔧 Requirements

* Node.js 18+
* npm 또는 yarn

---

## 📦 Installation

```bash
npm install
```

---

## ⚙️ Configuration

`.env` 파일을 생성하고 필요한 설정을 입력합니다.

예시:

```env
PORT=8080
API_KEY=your_api_key_here

DB_HOST=localhost
DB_USER=username
DB_PASSWORD=password
DB_DATABASE=yourdb
```

※ 실제 DB 구조 및 컬럼 명세는 내부 정책에 따라 구성합니다.

---

## ▶️ Starting the Server

```bash
npm start
```

서버가 정상적으로 실행되면 예시 메시지가 출력됩니다:

```
listening on :8080
```

---

## 📡 API Endpoints

### **POST /ingest/batch**

클라이언트에서 전달한 batched 이벤트를 서버가 수신하여 저장하는 엔드포인트입니다.

#### **Request Example**

```json
{
  "rows": [
    {
      "timestamp": "2025-01-01T10:00:00Z",
      "type": "click",
      "data": {
        "selector": "#login"
      }
    }
  ]
}
```

#### **Response Example**

```json
{ "ok": true }
```

> 실제 내부 저장 방식을 공개할 필요가 없어 삭제 또는 축약했습니다.

---

### **GET /healthz**

서버 상태 확인

```json
{ "ok": true }
```

---

## 🛠 Development Notes

* 이 서버는 **기본적인 이벤트 수집 개념**만을 제공합니다.
* 데이터베이스 저장 방식, 테이블 구조, 추가 처리 로직은 **배포 환경에 따라 내부적으로 구현**하십시오.
* 민감한 로직(API 보안, 세션/유저 관리, 원시 이벤트 전체 필드 등)은 이 저장소에 포함되어 있지 않습니다.

---

## 📄 License

Internal Use / Example Only

