# BizAI — Complete Tech Stack & What to Tell Sir (Viva / Evaluation Guide)

**Project:** BizAI – Fashion ERP & Commerce OS (REIHH Studio)  
**Team:** Team YATRI (Mohammad Ibad Hussain, Yash Narang, Ashutosh Yadav, Tushar, Ramji)  
**Client:** Amber Abbas · REIHH Studio  
**Live Frontend:** https://biz-ai-sooty.vercel.app  

---

## 1. Exact Tech Stack Used in BizAI

### Frontend (Client & Admin Workspace)
| Layer | Technology | Version / Role |
|-------|------------|----------------|
| **UI Framework** | **React 19** (`react`, `react-dom`) | `^19.2.8` — Component-based SPA |
| **Build Tool** | **Vite** (`vite`, `@vitejs/plugin-react`) | `^8.2.2` — Fast HMR dev & optimized bundle |
| **Routing** | **React Router** (`react-router-dom`) | `^7.18.2` — Protected RBAC routes + public `/store` & `/track` |
| **HTTP Client** | **Axios** (`axios`) | `^1.20.0` — JWT interceptor, 401/403 redirect, PDF/CSV blob downloads |
| **Charts & BI** | **Chart.js** + `react-chartjs-2` | `^4.5.1` — 30-day sales trend, top-products doughnut, expense breakdown |
| **Maps & Logistics** | **Leaflet** + `react-leaflet` | `^1.9.4` / `^5.0.0` — Live Delhi NCR / Pan-India delivery map |
| **Icons & Linting** | **Lucide React** (`lucide-react`) · **Oxlint** | `^1.34.0` / `^1.79.0` |

### Backend (REST API & Business Logic)
| Layer | Technology | Version / Role |
|-------|------------|----------------|
| **Web Framework** | **FastAPI** (Python) | `>=0.115.0` — Typed REST APIs with auto OpenAPI docs |
| **ASGI / WSGI Server** | **Uvicorn**, **Gunicorn**, **a2wsgi** | Cloud production hosting on Azure |
| **ORM & Migrations** | **SQLAlchemy 2.0** + **Alembic** | `>=2.0.40` — Layered ORM models + idempotent schema migration (`ensure_schema`) |
| **Validation** | **Pydantic v2** + `pydantic-settings` | `>=2.10.0` — Request/response validation & `.env` settings |
| **Database** | **PostgreSQL** (`psycopg2-binary`) / **SQLite** | PostgreSQL (Neon/cloud) in production, SQLite for isolated dev/testing |
| **Auth & Security** | **JWT** (`python-jose[cryptography]`) + **bcrypt** (`passlib`) | Token auth, hashed passwords, 4-role RBAC enforcement |
| **PDF & Exports** | **ReportLab** (`4.0.8`) + Python `csv` | GST Tax Invoices, Packing Slips, P&L PDFs, GSTR-1 CSV filings |
| **HTTP Integration Client** | **httpx** (`0.25.2`) | Calling Razorpay, Groq, Gemini, Azure OpenAI APIs |

### AI Engine (Pluggable Co-Pilot)
- **Multi-Provider LLM Support:** **Groq** (`groq==0.4.2`), **Google Gemini** (`google-generativeai>=0.8.0`), and **Azure OpenAI** (`gpt-4o`), configured dynamically via environment variables or DB settings.
- **Database-Grounded Analytics:** Builds a live SQL business snapshot (revenue, COGS, expenses, low stock, orders, storefront funnel) + deterministic offline fallback so the AI never hallucinates store numbers.

### Third-Party Integrations & Cloud Hosting
- **Payments:** **Razorpay** API + HMAC-SHA256 signature verification (plus interactive Card 3DS OTP, UPI QR, and Phone-OTP COD sandbox).
- **Actual vs Demo Payment Separation:** Every order, invoice, and payment carries a `channel` tag (`real` vs `demo`) with separated totals, summary cards, filters, and `ACTUAL` / `DEMO` badges across Dashboard, Reports, Invoices & Payments, Orders, Customers, and Storefront.
- **Logistics:** **Delhivery Express** AWB waybills, tracking URLs, carrier scan webhook simulator, and live delivery status page (`/track/:ref`).
- **E-Commerce:** **Shopify** Admin API & HMAC-SHA256 signed webhooks (`2026-07`), plus REIHH Studio live catalog sync.
- **Hosting:** **Vercel** (Frontend CDN) + **Microsoft Azure App Service** (Backend API) + custom domain `www.bizai-reihh.site`.

---

## 2. What to Tell Sir (Ready-to-Speak Script)

### 30-Second Elevator Pitch (Start With This)
> *"Sir, we built **BizAI** — a full-stack Fashion ERP and Commerce OS for **REIHH Studio**, a luxury apparel brand. Earlier they managed orders, stock, and GST bills manually on WhatsApp and Excel. BizAI unifies CRM, garment-variant inventory, order lifecycle with Delhivery tracking, automated GST invoicing, P&L/GSTR-1 reports, an AI Business Advisor, and a live customer storefront in one platform. It is built with **React 19 + Vite** on **Vercel**, **FastAPI + SQLAlchemy + PostgreSQL** on **Microsoft Azure**, and verified with **121 SRS test cases**. The client has already signed the Phase-1 acceptance letter and paid ₹1,00,000, with ₹1,00,000 remaining upon Phase-2 cutover to live Delhivery pickups and their live Shopify store."*

---

### How to Explain Each Engineering Decision If Sir Asks

1. **"Why FastAPI instead of Django/Node?"**
   > *"FastAPI gives us strict Pydantic v2 schema validation, automatic OpenAPI/Swagger documentation, and high throughput while staying in Python — which lets our backend talk natively to ReportLab (for GST/P&L PDFs) and the AI SDKs (Groq/Gemini)."*

2. **"Why PostgreSQL / Relational DB instead of MongoDB?"**
   > *"An ERP handles inventory stock reservations, multi-line orders, GST tax splits (CGST/SGST/IGST), and partial invoice payments. We need ACID transactions and foreign-key integrity so stock never oversells and balances always reconcile."*

3. **"How did you separate Demo payments from Real payments?"**
   > *"Sir, because our public storefront also acts as a live sandbox for evaluators and clients without charging real cards, mixing sandbox checkouts with real sales would corrupt accounting. So we added a `channel` column (`real` vs `demo`) across Orders, Invoices, and Payments. Live Razorpay/ERP entries are tagged `ACTUAL`, sandbox/storefront simulations are tagged `DEMO`, and Dashboard, Reports, Orders, and Invoices let you filter or view both totals side-by-side — while GSTR-1 tax export defaults strictly to Actual sales."*

4. **"How does your AI Business Advisor avoid hallucinating numbers?"**
   > *"Instead of letting the LLM guess, every query first builds a live SQL snapshot (`build_business_snapshot`) with exact revenue, COGS, realized expenses, stock alerts, and order statuses, passes that as grounded context to Groq/Gemini/Azure OpenAI, and keeps a deterministic reasoning fallback if API keys are offline."*

5. **"How did you verify quality and security?"**
   > *"We enforce JWT authentication and 4-role RBAC (Admin, Manager, Employee, Accountant) at both API middleware and React route guards, verify Shopify & Razorpay webhooks with HMAC-SHA256, and run an automated 121-case SRS verification suite using FastAPI's `TestClient` covering auth, RBAC, stock locking, GST math, PDF exports, and payment separation."*

6. **"What is left for Phase 2 / Final Handover?"**
   > *"The core ERP and storefront are complete and accepted. Phase 2 is strictly production cutover: live Delhivery API pickup credentials, cutover to the live `reihh.com` Shopify subscription, live Razorpay KYC production keys, and full DNS rollout on `www.bizai-reihh.site`."*

---

## 3. Quick 3-Minute Live Demo Flow for Sir
1. **Login & RBAC** → Show Employee vs Accountant vs Admin view.
2. **Dashboard** → Point out live metrics, **Actual vs Demo** payment split cards, and channel filter (`All` / `Actual` / `Demo`).
3. **Storefront (`/store`)** → Add a REIHH garment, apply a coupon, run sandbox checkout → show **DEMO PAYMENT** badge + Delhivery AWB & live tracking link.
4. **Orders & Map (`/orders`)** → Show the new order immediately appearing with a `DEMO` pill, push a Delhivery scan update, and open the Leaflet delivery map.
5. **Invoices & Payments (`/invoices`)** → Show `Actual Payments` vs `Demo Payments` summary cards, GST breakdown, Payment Receipts tab, and PDF download.
6. **Reports & AI (`/reports`, `/ai`)** → Filter reports by `Actual`, download P&L PDF / GSTR-1 CSV, and ask the AI Business Advisor: *"What is our net profit and which garment has the best margin?"*
