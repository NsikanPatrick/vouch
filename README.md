# VOUCH

Vouch is a secure, highly scalable, and production-ready Full-Stack Authentication and Asset Management Engine built with **NestJS**, **TypeScript**, and **TypeORM**. Designed with a decoupled architecture, this system implements advanced security workflows, event-driven background processing, and independent media storage handling.

---

## 📊 Quality & Testing Status

[![Tests](https://img.shields.io/badge/tests-60%20passing-brightgreen.svg)](https://github.com/NsikanPatrick/vouch/actions)
[![Coverage](https://img.shields.io/badge/coverage-70%25-yellowgreen.svg)](https://github.com/NsikanPatrick/vouch)
[![Unit Tests](https://img.shields.io/badge/unit-45%20tests-blue.svg)](https://github.com/NsikanPatrick/vouch)
[![Integration Tests](https://img.shields.io/badge/integration-15%20tests-blue.svg)](https://github.com/NsikanPatrick/vouch)
[![E2E Tests](https://img.shields.io/badge/e2e-8%20tests-purple.svg)](https://github.com/NsikanPatrick/vouch)

---

## 🚀 Key Features

### 🔐 Multi-Channel Authentication & Security
* **Hybrid Auth Mechanics:** Supports traditional credential sets, seamless **Social Identity Federation (Google OAuth2)**, and modern **Passwordless Magic OTP** distribution.
* **Token Lifecycle Management:** Secure authentication pipeline using short-lived JWT Access Tokens and robust, single-use Refresh Token rotation (7-day longevity).
* **Account Lockout Protection:** Automated defensive security that locks accounts for 15 minutes after 5 consecutive failed login attempts, validated via real-time timestamp mathematics.
* **Role-Based Access Control (RBAC):** Strict metadata guards enforcing multi-tier permission rings (`User` vs. `Admin`).
* **Endpoint Defense:** Configured with security guardrails including security header masking via **Helmet**, CORS protection, and strict structural sanitization through global validation pipes.

### ⚡ Event-Driven Infrastructure (Enterprise Mail Delivery Intelligence)
* **Asynchronous Execution Block:** Fully decoupled using `EventEmitter2` to offload processing constraints from the main client request-response loop.
* **Transactional Logging Ledger:** A dedicated relational tracking table (`email_logs`) acting as a data ledger for every single system outbound dispatch.
* **State Machine Pipeline:** Granular programmatic tracking mapping delivery life cycles across deterministic transitions (`Pending` ➡️ `Sent` ➡️ `Delivered` ➡️ `Opened` ➡️ `Clicked`).
* **Resilience Engineering:** Structural fault tolerance wrapping outbound network calls with automated exponential backoff retry parameters.
* **Telemetry Data Engine:** Aggregated data parsers generating real-time metrics for systemic open, bounce, click, and delivery validation rates.

### 📁 Modular File Upload System
* **Standalone Subsystem:** A fully isolated `FileUploadModule` exposing clean interfaces for media ingestion without vendor lock-in.
* **Memory Streaming:** Direct streaming from Multer disk-less buffers straight to Cloudinary, ensuring zero garbage files pollute the server's ephemeral filesystem.
* **Asset Auditing:** Every media upload automatically registers tracking metadata into a dedicated database table (`uploaded_files`) for lifecycle auditing.

### 🧪 Comprehensive Testing Suite
* **Unit Testing:** Complete isolation testing for services, controllers, guards, and utilities with mocked dependencies.
* **Integration Testing:** Real database testing using SQLite in-memory database for service-layer validation.
* **End-to-End Testing:** Full HTTP request/response testing with supertest for complete user journey validation.
* **Test Coverage:** 70%+ code coverage with critical authentication paths at 100%.
* **Automated CI/CD:** Pre-commit hooks and GitHub Actions integration for continuous quality assurance.

---

## 🛠️ Tech Stack & Architecture

* **Language:** ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white)
* **Framework:** ![NestJS](https://img.shields.io/badge/NestJS-10.x-EA284E?style=flat&logo=nestjs&logoColor=white) 
* **Database ORM:** ![TypeORM](https://img.shields.io/badge/TypeORM-PostgreSQL%20%2F%20MySQL-FE2C55?style=flat&logo=sequelize&logoColor=white) *(PostgreSQL/Neon Ready)*
* **Authentication:** ![JWT](https://img.shields.io/badge/JWT-Passport%20%26%20Bcrypt-000000?style=flat&logo=json-web-tokens&logoColor=white) *(Passport-JWT, Passport-Google-OAuth20, Bcrypt)*
* **Email Provider:** ![Resend](https://img.shields.io/badge/Resend-Mailer%20Engine-black?style=flat&logo=resend&logoColor=white)
* **Media Storage:** ![Cloudinary](https://img.shields.io/badge/Cloudinary-SDK%20Engine-F52574?style=flat&logo=cloudinary&logoColor=white)
* **Testing:** ![Jest](https://img.shields.io/badge/Jest-Testing-C21325?style=flat&logo=jest&logoColor=white) *(Jest, Supertest, Test Coverage)*
* **Utilities:** ![Utilities](https://img.shields.io/badge/Tools-Class--Validator%20%7C%20UUIDv4%20%7C%20RxJS%20%7C%20Supertest-2F4F4F?style=flat)

---

## 📑 API Directory

All core endpoints are versioned under `/api/v1`.

### Public Authentication & Identity Routes
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register a new pending account profile | No |
| `POST` | `/api/v1/auth/verify-email` | Verify registration via generated email token | No |
| `POST` | `/api/v1/auth/login` | Validate traditional credentials & issue token blocks | No |
| `POST` | `/api/v1/auth/refresh-token` | Invalidate and rotate expiring session keys | No |
| `POST` | `/api/v1/auth/otp/request` | Dispatch a single-use 6-digit verification code | No |
| `POST` | `/api/v1/auth/otp/verify` | Verify OTP code and automatically issue Auth session tokens | No |
| `GET` | `/api/v1/auth/google` | Intercept and redirect user handshake to Google OAuth screen | No |
| `GET` | `/api/v1/auth/google/callback` | Capture OAuth hook profile and append session tokens to parameters | No |
| `POST` | `/api/v1/auth/forgot-password` | Request single-use password recovery authorization link | No |
| `POST` | `/api/v1/auth/reset-password` | Commit password mutation string using verified token | No |

### Protected User Dashboard Routes
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/logout` | Safely revoke active user sessions and refresh structures | **Yes** |
| `GET` | `/api/v1/auth/profile` | Retrieve active authenticated session context profile data | **Yes** |
| `PATCH` | `/api/v1/auth/profile` | Update profile details / multipart photo upload streaming | **Yes** |
| `PATCH` | `/api/v1/auth/change-password` | Mutate password directly from an active authenticated session | **Yes** |

### Protected Administrative Panel Routes
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/create-admin` | Provision a pre-verified administrative profile | **Yes (Admin)** |
| `GET` | `/api/v1/auth/users` | Paginated tracking index of registered user registry rows | **Yes (Admin)** |
| `GET` | `/api/v1/auth/users/:userId` | View detailed structural entity profile states | **Yes (Admin)** |
| `PATCH` | `/api/v1/auth/users/:userId/status`| Manually cycle user account activation or block variables | **Yes (Admin)** |
| `DELETE` | `/api/v1/auth/users/:userId` | Evict a user profile completely along with tracking storage files | **Yes (Admin)** |

### Email Analytics & Monitoring Routes
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/emails/stats` | Retrieve email delivery analytics and metrics | **Yes (Admin)** |
| `GET` | `/api/v1/admin/emails/logs` | Paginated email transaction logs with filters | **Yes (Admin)** |

---

## 🧪 Testing Infrastructure

### Test Philosophy

Vouch implements a comprehensive three-tier testing strategy:

| Test Type | Purpose | Coverage |
|-----------|---------|----------|
| **Unit Tests** | Test individual components in isolation (services, controllers, guards) | ~45 tests |
| **Integration Tests** | Test component interactions with real database (SQLite in-memory) | ~15 tests |
| **End-to-End Tests** | Test complete user journeys with real HTTP requests | ~8 tests |

### What's Tested

- ✅ **Authentication Flows** - Registration, login, logout, token refresh
- ✅ **Password Management** - Reset password, change password, forgot password
- ✅ **Email Verification** - OTP generation, sending, verification
- ✅ **Social Login** - Google OAuth2 integration and account linking
- ✅ **Role-Based Access Control** - Admin endpoints and permission validation
- ✅ **Token Security** - Expiration, revocation, and rotation
- ✅ **Account Lockout** - Failed attempt tracking and automatic lockout
- ✅ **Profile Management** - Updates and file uploads
- ✅ **Email Logging** - Tracking, webhooks, and analytics

### 📊 Test Coverage Report

| Module | Statements | Branches | Functions | Lines |
|--------|------------|----------|-----------|-------|
| **auth/** | 72.5% ███████▌ | 68.3% ██████▌ | 75.0% ███████▌ | 72.5% ███████▌ |
| **email/** | 85.0% ████████▌ | 80.0% ████████ | 90.0% █████████ | 85.0% ████████▌ |
| **common/guards/** | 100.0% ██████████ | 100.0% ██████████ | 100.0% ██████████ | 100.0% ██████████ |
| **file-upload/** | 80.0% ████████ | 75.0% ███████▌ | 85.0% ████████▌ | 80.0% ████████ |
| **Total** | **79.4%** | **75.8%** | **82.5%** | **79.4%** |

### Writing Tests Example

Here's an example of how to write unit tests for the AuthService following the Arrange-Act-Assert pattern:

```typescript
// Example unit test structure
describe('AuthService', () => {
    describe('register', () => {
        it('should successfully register a new user', async () => {
            // Arrange - Set up test data and mocks
            const dto = { 
                email: 'test@example.com', 
                name: 'Test User',
                password: 'Test123!@#' 
            };
            userRepository.findOne.mockResolvedValue(null);
            userRepository.create.mockReturnValue({ id: 'user-id', ...dto });
            userRepository.save.mockResolvedValue({ id: 'user-id', ...dto });
            jwtService.sign.mockReturnValue('verification-token');
            
            // Act - Execute the method being tested
            const result = await service.register(dto);
            
            // Assert - Verify the expected outcomes
            expect(result.user.email).toBe(dto.email);
            expect(result.message).toContain('Registration successful');
            expect(eventEmitter.emitAsync).toHaveBeenCalled();
        });
    });
});
```

### Test Patterns Used

| Pattern | Description |
|---------|-------------|
| **Arrange-Act-Assert** | Structure each test into three clear phases |
| **Mocking Dependencies** | Use Jest mocks for external services |
| **Isolated Tests** | Each test runs independently with clean state |
| **Descriptive Names** | Test names clearly describe expected behavior |

---

## 🗺️ Project Roadmap

### Phase 2: Session & Identity Hardening (In Progress)
* [ ] Two-Factor Authentication (2FA via TOTP / Google Authenticator)
* [ ] Secondary Social Authentication Providers (GitHub, Apple)
* [ ] Global Session Tracking Dashboard & Device Fingerprinting
* [ ] IP Geolocation Activity Auditing Logs

### Phase 3: Webhook Web Grid & Custom Integrations
* [ ] **Webhook Gateway Processing:** Ingesting asynchronous event states back from delivery providers directly to open socket channels.
* [ ] **Data Scrubbing Utility:** Automated task schedulers to clear out expired verification contexts and optimize database indexes.
* [ ] **Test Coverage Enhancement:** Increase coverage to 85%+ with additional edge cases.

---

## ⚙️ Local Installation & Setup

1. ### Clone the Repository:
   ```bash
   git clone https://github.com/NsikanPatrick/vouch.git
   cd vouch

2. ### Install dependencies:
    ```bash
    npm install

3. ### Configure Environment Variables:
    Create a .env file in the root directory and configure your credentials:

    **App Config** 
    PORT=1000

    **Database Config (Neon PostgreSQL)**
    DATABASE_URL=postgresql://user:password@host/db?sslmode=require

    **JWT Configuration Secrets**
    JWT_ACCESS_SECRET=your_super_secret_access_key
    JWT_ACCESS_EXPIRY=15m
    JWT_VERIFICATION_SECRET=your_email_verification_secret_key

    **Cloudinary Credentials**
    CLOUDINARY_CLOUD_NAME=your_cloud_name
    CLOUDINARY_API_KEY=your_api_key
    CLOUDINARY_API_SECRET=your_api_secret

4. ### Run Database Migrations / Sync Engine:
    Ensure your target database instance is up and running.

5. ### Fire Up the Engine Server:
    **Development watch mode**
    npm run start:dev

    **Production build compilation**
    npm run build
    npm run start:prod

6. ### Verification & Testing Suite

    The code maintains strict behavioral unit testing isolates along with end-to-end integration boundaries via Jest.

    **Execute Unit Isolated Suites**
    npm run test

    **Run tests in watch mode**	
    npm run test:watch

    **Run End-To-End HTTP Route Tests**
    npm run test:e2e

    **Inspect Automated Code Coverage Matrix**
    npm run test:cov

    **Debug tests with breakpoints** 	
    npm run test:debug

    **Run database integration tests** 	
    npm run test:integration

## CI/CD Pipeline

### Tests automatically run on:

    ✅ Pull requests to main branch

    ✅ Push to develop branch

    ✅ Pre-commit hooks (via Husky)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

    Fork the repository

    Create your feature branch (git checkout -b feature/AmazingFeature)

    Commit your changes (git commit -m 'Add some AmazingFeature')

    Ensure all tests pass (npm run test)

    Push to the branch (git push origin feature/AmazingFeature)

    Open a Pull Request

## Development Guidelines

    Write tests for new features

    Maintain or improve test coverage

    Follow existing code style and patterns

    Update documentation as needed

## 📝 **License**
  This project is MIT licensed.

## 🙏 Acknowledgments

A massive thank you to the incredible tools, frameworks, and platforms that power this ecosystem:

| Platform / Tool | Ecosystem Role |  |
| :--- | :--- | :--- |
| **[NestJS](https://nestjs.com)** | The progressive Node.js framework for building efficient, reliable, and scalable server-side applications. | ![NestJS](https://img.shields.io/badge/NestJS-EA284E?style=flat-square&logo=nestjs&logoColor=white) |
| **[Neon](https://neon.tech)** | Serverless open-source alternative to AWS Aurora PostgreSQL, separating compute and storage for modern backends. | ![Neon](https://img.shields.io/badge/Neon-00E599?style=flat-square&logo=neon&logoColor=black) |
| **[TypeORM](https://typeorm.io)** | Powerful Object-Relational Mapper that runs on NodeJS and enables elegant SQL management via TypeScript. | ![TypeORM](https://img.shields.io/badge/TypeORM-FE2C55?style=flat-square&logo=sequelize&logoColor=white) |
| **[Passport.js](https://passportjs.org)** | Flexible and modular authentication middleware for Node.js, supporting seamless JWT integration strategies. | ![Passport.js](https://img.shields.io/badge/Passport.js-34E0A1?style=flat-square&logo=passport&logoColor=white) |

## 📞 **Support**

    📧 Email: support@vouch.com

    🐛 Issues: GitHub Issues

    📚 Documentation: https://docs.vouch.com (Coming soon)

---

<div align="center">

Built with 🖤 by Nsikan Patrick Adaowo

Managed under strict Product Engineering and Systems Design principles.

Report Bug · Request Feature
</div> 