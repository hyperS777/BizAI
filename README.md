# BizAI: Fashion ERP & Commerce Platform

**Team YATRI** | Software Engineering Project

A full-stack, AI-powered ERP and commercial operations platform built for an apparel and luxury fashion studio. It unifies inventory control, multi-carrier courier dispatch and live tracking, automated GST invoicing, customer relationship management, and an interactive customer-facing storefront with real-time financial reporting.

## Tech stack

| Layer | Choice |
|------|--------|
| Frontend | React + Vite, Chart.js |
| Backend | FastAPI |
| Database | SQLite for local/dev (switch `DATABASE_URL` to PostgreSQL for production) |
| AI | Snapshot from the database, then Groq if `GROQ_API_KEY` is set; otherwise a deterministic fallback |

## Run locally

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload --port 8000
```

The API creates tables on startup and seeds demo data if the database is empty.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in as `admin@bizai.com` / `admin123`.

Other seeded accounts:

- Manager: `manager@bizai.com` / `manager123`
- Employee: `staff@bizai.com` / `staff123`
- Accountant: `accounts@bizai.com` / `accounts123`

## Intended workflow

1. Sign in
2. Review dashboard metrics, Chart.js sales, and low-stock alerts
3. Manage customers and products
4. Create an order, confirm it (stock is deducted), generate an invoice PDF
5. Open Reports and ask the AI assistant questions about **live** records
