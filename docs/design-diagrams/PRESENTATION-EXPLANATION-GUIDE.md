# BizAI — In-Depth Presentation and Viva Explanation Guide

All notes below are derived from the **actual implemented codebase**. Every claim can be traced to a specific file. SQLite is the default database; PostgreSQL is supported only when `DATABASE_URL` is configured. The current API uses JWT/RBAC dependencies (not a custom JWT middleware class), and there is no rate limiter in the implementation.

---

## PROJECT OVERVIEW

### What is BizAI?

BizAI is an **AI-Powered Business Management Platform** built by **Team YATRI** as a Software Engineering academic project. It is a centralized workspace that allows a small or medium-sized business to manage its **customers, products, inventory, orders, invoices, expenses, reports, users, and get AI-driven business insights** — all from a single web application.

### Team

| Role | Name |
|------|------|
| Team Leader | Mohammad Ibad Hussain |
| Members | Yash Narang, Ashutosh Yadav, Tushar, Ramji |

### Problem Statement

Small businesses often rely on disconnected spreadsheets, paper records, and manual calculations to manage their daily operations. This leads to data inconsistencies, missed restock opportunities, invoice errors, and a lack of visibility into business performance. BizAI solves this by providing a single integrated platform where all business data is stored in a relational database and an AI assistant can answer natural-language questions grounded in that live data.

### Project Scope and Timeline

- **Duration**: 8-week college Software Engineering project
- **Development approach**: Phased, iterative development (Week 1: planning → Week 8: testing/deployment)
- **Methodology alignment**: Incremental development model (Sommerville SE10, Chapter 2) — the system is developed and delivered in increments, each increment adding functionality to the previous one
- **The MVP** was functional by end of Week 5 (customers → products → orders → invoices), with Weeks 6–8 dedicated to dashboard, reports, AI, polish, and testing

### Technology Stack

| Layer | Technology | Why chosen |
|-------|-----------|------------|
| **Frontend** | React 18 + Vite | Component-based SPA framework; Vite provides fast hot-module replacement during development |
| **Backend** | Python FastAPI | High-performance async framework with automatic OpenAPI documentation, Pydantic validation, and dependency injection |
| **ORM** | SQLAlchemy | Industry-standard Python ORM; provides database abstraction so we can switch between SQLite (dev) and PostgreSQL (prod) without code changes |
| **Database** | SQLite (default) / PostgreSQL (configurable) | SQLite is zero-configuration for local development; PostgreSQL for production via `DATABASE_URL` environment variable |
| **Authentication** | JWT (JSON Web Tokens) via `python-jose` | Stateless authentication — the server does not store sessions, making the API horizontally scalable |
| **Password hashing** | bcrypt via `passlib` | Industry-standard adaptive hashing algorithm resistant to brute-force attacks |
| **AI** | Groq API (LLaMA 3.1 8B) with deterministic fallback | External LLM provider for natural-language answers; the fallback ensures the system works even without an API key |
| **Charts** | Chart.js | Lightweight charting library for sales trends and dashboard visualizations |
| **PDF** | Server-side PDF generation | Invoice PDFs generated on the backend for download |
| **API protocol** | REST over JSON | Stateless, resource-oriented API design aligned with HTTP semantics |
| **Version control** | Git + GitHub | Standard version control with team collaboration |

### Architecture Pattern

BizAI follows a **layered architecture** (Sommerville SE10, Chapter 6, §6.3):

```
Presentation Layer    →  React SPA (Vite)
          ↓
Communication Layer   →  REST JSON API + Bearer JWT
          ↓
Application Layer     →  FastAPI Routers + Dependencies (auth/RBAC)
          ↓
Business Logic Layer  →  Service modules (order_service, product_service, etc.)
          ↓
Data Access Layer     →  SQLAlchemy ORM models
          ↓
Database Layer        →  SQLite / PostgreSQL
          ↓
External Services     →  Configurable AI provider (Groq)
```

**Why layered?** Each layer depends only on the layer below it. The React frontend knows nothing about SQLAlchemy; it only communicates via REST. The service modules know nothing about HTTP — they receive database sessions and return model objects. This **separation of concerns** makes the system testable, maintainable, and allows any layer to be replaced independently.

---

## DESIGN DECISIONS — COMMON VIVA QUESTIONS

### Q: Why FastAPI instead of Django or Flask?

FastAPI was chosen because:
1. **Automatic request validation** via Pydantic schemas — every request body is validated against a schema before reaching business logic
2. **Automatic API documentation** — Swagger UI is generated at `/docs` without writing documentation manually
3. **Dependency injection** — FastAPI's `Depends()` system allows us to inject database sessions, authenticated users, and role checks declaratively
4. **Performance** — FastAPI is one of the fastest Python web frameworks, comparable to Node.js and Go
5. **Appropriate complexity** — Django would be over-engineered for an API-only backend (we don't use Django templates); Flask would require manually adding validation, docs, and DI

### Q: Why SQLite instead of PostgreSQL?

SQLite is the **default** for development convenience — it requires zero installation and creates a single file (`bizai.db`). The architecture supports PostgreSQL by changing one environment variable (`DATABASE_URL`). The `database.py` file auto-detects the database type and adjusts connection arguments accordingly. This is a common pattern for production-ready applications.

### Q: Why JWT instead of session-based authentication?

JWT (JSON Web Token) authentication is **stateless** — the server does not need to store session data in memory or in a database. The token contains the user's email and expiry time, signed with a secret key. This makes the API:
1. **Horizontally scalable** — any server instance can validate the token
2. **Mobile-friendly** — tokens work the same way for web and mobile clients
3. **Simpler** — no session management, no server-side session store

The token expires after 30 minutes (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`). Passwords are hashed with bcrypt (adaptive hashing, 12 rounds by default).

### Q: How does role-based access control (RBAC) work?

RBAC is enforced **in the backend**, not just by hiding UI buttons. The `permissions.py` file defines a `RoleChecker` class that acts as a FastAPI dependency:

| Permission Level | Allowed Roles | Used For |
|-----------------|---------------|----------|
| `require_staff` | Admin, Manager, Employee, Accountant | Viewing any operational data |
| `require_employee` | Admin, Manager, Employee | Creating customers, creating orders |
| `require_accountant` | Admin, Manager, Accountant | Invoice updates, expense management |
| `require_manager` | Admin, Manager | Stock adjustments, product management, reports |
| `require_admin` | Admin only | User administration |

If a user with the wrong role tries to access a protected endpoint, the API returns `403 Forbidden` regardless of what the frontend shows.

### Q: How does the AI assistant work? Is it just ChatGPT?

No. The AI assistant uses a **Data-Grounded AI** approach (not RAG/vector databases):

1. **User submits a question** → `POST /api/ai/chat`
2. **`ai_service.answer_query()`** calls **`report_service.build_business_snapshot(db)`** which queries the database for:
   - Sales summary (total, daily, monthly, previous month)
   - Revenue and profit calculations
   - Inventory summary (total products, low-stock count)
   - Top 5 and bottom 5 products by revenue
   - Recent orders
   - Low-stock product details
   - Outstanding customer balances
3. **If a Groq API key is configured**: The snapshot JSON + user question is sent to LLaMA 3.1 8B with a system prompt that says "Answer only from the JSON snapshot. Never invent numbers."
4. **If no API key**: A deterministic keyword-based fallback function (`_fallback_answer`) parses the question for keywords like "low stock", "best selling", "compared", "summary" and returns pre-formatted answers from the snapshot data
5. **The question and answer are logged** in the `ai_queries` table

**Key point**: The AI can **never invent business numbers** because it only receives actual database aggregations. If the snapshot doesn't contain the answer, the AI says so.

### Q: How is profit calculated?

Profit = Total Sales Revenue − Cost of Goods Sold (COGS) − Total Expenses

- **Revenue**: Sum of `orders.total_amount` for non-cancelled orders
- **COGS**: Sum of `(order_items.quantity × products.cost_price)` for non-cancelled orders
- **Expenses**: Sum of `expenses.amount` across all expense records

This is calculated in `report_service.get_dashboard_metrics()`.

### Q: What happens when an order is confirmed?

When an order status changes from `pending` → `confirmed`:
1. `order_service.update_order_status()` loops through every order item
2. For each item, it calls `product_service.update_stock(product_id, -quantity, commit=False)`
3. `update_stock()` checks if the resulting stock would be negative — if so, it raises `ValueError`
4. If any item has insufficient stock, the entire transaction is **rolled back** (no partial deductions)
5. If all deductions succeed, `inventory_movements` records are created for each item, and the transaction is committed
6. When a confirmed/shipped order is **cancelled**, the reverse happens — stock is **added back** via `update_stock(product_id, +quantity)`

### Q: What design patterns are used?

| Pattern | Where | Sommerville Reference |
|---------|-------|-----------------------|
| **Layered architecture** | Overall system structure | SE10 §6.3 |
| **Repository pattern** | Service modules abstract database queries from routers | SE10 §6.4 |
| **Dependency injection** | FastAPI `Depends()` for db sessions, auth, role checks | SE10 §6.4 |
| **Observer pattern** (conceptual) | Stock changes trigger inventory movement records | SE10 §7.3 |
| **Strategy pattern** | AI provider is configurable — Groq or fallback | SE10 §7.3 |
| **Facade pattern** | `build_business_snapshot()` provides a single interface to multiple data sources | SE10 §7.3 |

### Q: What software process model did you follow?

**Incremental development** (Sommerville SE10, Chapter 2, §2.1.2). The system was built in 8 weekly increments:

1. Planning and database design
2. Authentication and frontend/backend integration
3. Customer and product modules
4. Inventory and order management
5. Invoice generation (core workflow complete)
6. Dashboard, reports, and charts
7. AI assistant and UI polish
8. Testing, bug fixing, and deployment

Each increment produced a working system that could be demonstrated to the client. This aligns with Sommerville's observation that incremental development "reduces the cost of accommodating changing customer requirements" because the amount of rework is limited to the current increment.

### Q: What are the non-functional requirements?

| NFR | How addressed |
|-----|--------------|
| **Performance** | FastAPI async, SQLAlchemy query optimization, index on frequently queried columns (email, order_number, sku) |
| **Security** | bcrypt password hashing, JWT with expiry, RBAC enforced in backend, CORS whitelisting, environment variables for secrets |
| **Reliability** | Database transactions with rollback on failure, validation at schema and service layers |
| **Usability** | Modern SPA interface, responsive layout, loading/error/empty states |
| **Maintainability** | Layered architecture, separated concerns, modular service files |
| **Portability** | SQLite ↔ PostgreSQL via single environment variable, no platform-specific code |

---

## DIAGRAM-BY-DIAGRAM EXPLANATION

---

### DIAGRAM 1 — System Architecture (Component/Deployment View)

**File**: `01-system-architecture.mmd`
**UML diagram type**: Component diagram with deployment aspects
**Sommerville reference**: SE10 Chapter 6, §6.3 (Architectural patterns — layered architecture)

**What it shows**: The physical and logical structure of the BizAI system.

**Components**:
- **Staff user**: The human actor who interacts with the system through a web browser
- **Web browser (React + Vite SPA)**: The presentation layer. React renders the UI as a Single Page Application bundled by Vite. All page transitions happen client-side without full page reloads
- **BizAI FastAPI application (subgraph)**: The server-side application boundary containing:
  - **API routers**: FastAPI route handlers that define HTTP endpoints (e.g., `POST /api/orders`). There are 11 router modules: auth, users, customers, products, orders, invoices, expenses, reports, ai, demo, notifications
  - **JWT authentication and role permissions**: FastAPI dependency functions that validate the Bearer token and check the user's role before allowing access to protected endpoints. This is NOT a middleware class — it's implemented via `Depends(get_current_active_user)` and `Depends(RoleChecker(...))`
  - **Business modules**: Service-layer Python modules (e.g., `order_service.py`, `product_service.py`) that contain all business logic. Routers are thin — they call service functions and return responses
  - **SQLAlchemy ORM models**: Python classes that map to database tables. Each model defines columns, relationships, and constraints using SQLAlchemy's declarative syntax
- **Relational database (SQLite by default)**: The persistent data store. Uses SQLite for development; can switch to PostgreSQL by changing one environment variable
- **Data-grounded AI assistant**: An external AI provider (currently Groq with LLaMA 3.1 8B) selected through configuration. The dashed connection from business modules means the AI is **optional** — the system works without it by falling back to deterministic keyword-based answers

**Data flow**: User → Browser → (REST JSON + Bearer JWT) → API routers → Auth check → Business logic → ORM → Database. For AI queries, business logic also calls the AI provider with a structured data snapshot.

**Why this architecture?** The layered approach means:
- Frontend developers can work independently from backend developers
- Business logic can be unit-tested without HTTP
- The database can be changed without modifying business logic
- The AI provider can be swapped without touching any other layer

---

### DIAGRAM 2 — Use-Case Diagram

**File**: `02-use-cases.mmd`
**UML diagram type**: Use-case diagram
**Sommerville reference**: SE10 Chapter 5, §5.2 (Use-case modelling)

**What it shows**: The functional scope of the system from the perspective of its four actor roles.

**Actors** (external entities that interact with the system):

| Actor | Role in the system | Allowed use cases |
|-------|-------------------|-------------------|
| **Admin** | Full system access, user management | All 13 use cases |
| **Manager** | Operational management | All except user management |
| **Employee** | Customer-facing operations | Sign in, manage customers, create orders, view dashboard/reports, ask AI |
| **Accountant** | Financial operations | Sign in, invoices, expenses, reports, AI, PDF download |

**Use cases** (inside the system boundary):
1. **Sign in** — OAuth2 form-based login returning a JWT
2. **Manage users** — CRUD operations on user accounts (Admin only)
3. **Manage customers** — Add, edit, view, search customer records
4. **Manage products and categories** — Product CRUD with category classification
5. **Adjust stock** — Manual stock adjustments with reason/notes tracking
6. **Create order** — Select customer, add products, save as pending
7. **Change order status** — Transition orders through pending → confirmed → shipped → delivered (or cancelled)
8. **Generate invoice from order** — Create a `sent` invoice with 15-day due date
9. **Update invoice / record payment** — Update paid amount, mark as paid
10. **Download invoice PDF** — Server-generated PDF download
11. **Manage expenses** — Record business expenses with categories
12. **View dashboard and reports** — Real-time metrics, charts, sales analysis
13. **Ask AI assistant** — Natural-language questions answered from live data

**`«include»` relationships** (UML mandatory reused behaviour):
- **Adjust stock** `«include»` → **Record inventory movement**: Every stock adjustment automatically creates an `inventory_movements` record. This is mandatory — you cannot adjust stock without recording the movement.
- **Change order status** `«include»` → **Record inventory movement**: When an order is confirmed, stock is deducted and movements are recorded. When cancelled from confirmed/shipped, stock is restored. The guard (confirmation or cancellation only) determines when this inclusion is triggered.
- **Ask AI assistant** `«include»` → **Build business snapshot**: Every AI query first builds a structured snapshot of current business data from the database. The AI cannot answer without this snapshot.

**Notation rules applied**:
- Actors are connected to individual use cases with **solid, undirected association lines** (not to the system boundary or to groups)
- `«include»` uses **dashed arrows with guillemet stereotypes** pointing from the including use case to the included use case
- Guard conditions are documented separately from the stereotype label (per UML 2.5 §18.2)

---

### DIAGRAM 3 — DFD Level 0 (Context Diagram)

**File**: `03-dfd-level0.mmd`
**Diagram type**: Data Flow Diagram (DFD) — NOT UML (this is Yourdon/DeMarco notation)
**Sommerville reference**: SE10 Chapter 5, §5.2 (Context models)

**What it shows**: BizAI as a single process with all external entities and data flows crossing the system boundary.

**External entities** (rectangles):
- **Administrator**: Sends configuration data and user credentials; receives user-management results and system status
- **Manager**: Sends operational requests and business queries; receives AI insights and aggregated reports
- **Employee**: Sends customer and order details; receives customer and order results
- **Accountant**: Sends payment entries and expense records; receives financial summaries and invoices
- **AI Provider Service**: Receives business context and natural-language queries; returns AI-generated responses

**Key DFD rules followed**:
1. **Only one process** at Level 0 — BizAI is treated as a black box
2. **No data stores** at Level 0 — data stores only appear at Level 1 and below
3. **Data flows are labelled with data names** (e.g., "Configuration Data", "Financial Summaries"), not with UI actions ("click button") or screen names
4. **No entity-to-entity arrows** — all flows pass through the central process
5. **Bidirectional flows** are shown as separate arrows in each direction

**Why a DFD and not just UML?** Sommerville SE10 discusses DFDs as effective for modelling data processing systems where the focus is on how data flows through the system. The BizAI system is fundamentally a data-processing application (business records in, reports/insights out), making DFDs particularly appropriate.

---

### DIAGRAM 4 — DFD Level 1

**File**: `04-dfd-level1.mmd`
**Diagram type**: Data Flow Diagram Level 1 (decomposition of Level 0)
**Sommerville reference**: SE10 Chapter 5, §5.2

**What it shows**: The BizAI system process decomposed into six sub-processes, with data stores.

**Processes** (circles, numbered):
| Process | Name | What it does in the code |
|---------|------|--------------------------|
| 1.0 | Authenticate User | `auth.py` router + `security.py` — validates credentials, creates JWT |
| 2.0 | Manage Customers and Catalog | `customer_service.py` + `product_service.py` — CRUD for customers, products, categories |
| 3.0 | Process Orders | `order_service.py` — creates orders, manages status transitions, triggers stock updates |
| 4.0 | Manage Invoices and Expenses | `invoice_service.py` + `expense_service.py` — generates invoices from orders, records expenses |
| 5.0 | Generate Reports | `report_service.py` — aggregates data from multiple stores for dashboard metrics |
| 6.0 | Process AI Queries | `ai_service.py` — builds business snapshot, calls AI provider or fallback, logs query |

**Data stores** (cylinders):
| Store | Contains | Maps to database tables |
|-------|----------|------------------------|
| D1 | roles and users | `roles`, `users` |
| D2 | Customers and Catalog DB | `customers`, `categories`, `products` |
| D3 | orders and order_items | `orders`, `order_items` |
| D4 | Finance DB | `invoices`, `expenses` |
| D5 | ai_queries | `ai_queries` |

**Balancing check** (Level 1 must balance Level 0):
- Every external entity from Level 0 appears in Level 1
- Every data flow crossing the Level 0 boundary has a corresponding flow in Level 1
- The AI Provider Service external entity is preserved
- No new external entities are introduced

---

### DIAGRAM 5 — Login Sequence Diagram

**File**: `05-sequence-login.mmd`
**UML diagram type**: Sequence diagram
**Sommerville reference**: SE10 Chapter 5, §5.3 (Interaction models)
**Implements**: `routers/auth.py`, `utils/security.py`, `utils/deps.py`

**Lifelines** (participants):
1. **Staff user** (actor) — the human
2. **React Login page** — the frontend login component
3. **FastAPI /api/auth** — the authentication router
4. **SQLAlchemy database** — the persistence layer

**Flow step by step**:

1. User enters email and password in the login form
2. React sends `POST /api/auth/login` as an **OAuth2 password form** (not JSON — FastAPI uses `OAuth2PasswordRequestForm` which expects form-encoded `username` and `password` fields)
3. FastAPI queries the database: `db.query(User).filter(User.email == form_data.username).first()`
4. Database returns the User record or None

**Alt fragment** (alternative scenarios):
- **No user, invalid password, or inactive user**:
  - If no user found or password hash doesn't match: returns `401 Unauthorized`
  - If user exists but `is_active == False`: returns `400 Inactive user`
  - React displays the authentication error to the user
- **Authenticated**:
  - API verifies the password hash using bcrypt (`verify_password()`) and creates a signed JWT containing the user's email as the subject (`sub`) and an expiry time
  - Returns `200 {access_token, token_type: "bearer"}`
  - React stores the token in `localStorage`
  - React immediately calls `GET /api/auth/me` with `Authorization: Bearer <token>` to retrieve the full user profile
  - API validates the JWT signature, checks the user is still active, and returns `UserResponse` (id, email, full_name, role)
  - React navigates to the dashboard

**Why two API calls?** The login endpoint returns only a token (OAuth2 convention). The `/me` endpoint retrieves the user's profile and role information needed to render the correct UI (e.g., hiding admin-only menu items).

---

### DIAGRAM 6 — Order Flow Sequence Diagram

**File**: `06-sequence-order-flow.mmd`
**UML diagram type**: Sequence diagram with combined fragments (alt, loop)
**Sommerville reference**: SE10 Chapter 5, §5.3
**Implements**: `routers/orders.py`, `services/order_service.py`, `services/product_service.py`

This is the most complex sequence diagram because it covers the complete order lifecycle.

**Part 1 — Create a pending order**:
1. Staff user selects a customer and products in the React UI
2. React sends `POST /api/orders` with `customer_id` and `items[]` array
3. Router calls `order_service.create_order(db, order, current_user.id)`
4. Service first verifies the customer exists — if not, returns `404 Customer not found`
5. For **each order item** (loop fragment):
   - Finds the product by ID
   - Validates the product is active (`is_active == True`)
   - Reads the current selling price (`product.price`)
   - If product not found or inactive, returns an error
6. Creates the `Order` record with status `pending` and all `OrderItem` records
7. Calculates `total_amount` as the sum of all `unit_price × quantity`
8. Commits the transaction and returns the created order

**Important**: Stock is NOT deducted when an order is created. Stock is only deducted when the order is **confirmed**. This prevents stock from being locked by draft/pending orders.

**Part 2 — Change order status** (Admin or Manager only):
- **Order not found**: Returns `404`
- **Pending → Confirmed**:
  - For each order item, calls `product_service.update_stock(product_id, -quantity, commit=False)`
  - `update_stock()` checks if `current_stock + quantity_change >= 0`
  - If **insufficient stock** for any item: raises `ValueError`, triggers `db.rollback()`, returns `400`
  - If **stock available**: updates `products.stock_qty` and creates an `inventory_movements` record
  - After all items succeed: commits the entire transaction atomically
- **Cancelled from confirmed or shipped** (NEW — added in this review):
  - For each order item, calls `update_stock(product_id, +quantity, commit=False)` — **restoring** the stock
  - Creates `inventory_movements` with reason `order_cancelled`
  - Commits and returns the cancelled order
- **Other permitted status change** (e.g., confirmed → shipped, shipped → delivered):
  - Simply updates the status and commits

**Why is this diagram important?** It demonstrates:
- **Transaction management** — all-or-nothing stock deductions
- **Referential integrity** — customer and product existence validation
- **Business rules** — only managers/admins can change status, stock cannot go negative
- **Rollback behaviour** — if any item fails, no items are deducted

---

### DIAGRAM 7 — Invoice Sequence Diagram

**File**: `07-sequence-invoice.mmd`
**UML diagram type**: Sequence diagram with alt and opt fragments
**Sommerville reference**: SE10 Chapter 5, §5.3
**Implements**: `routers/invoices.py`, `services/invoice_service.py`

**Flow**:
1. Authorised user requests `POST /api/invoices/from-order/{order_id}`
2. Service calls `generate_invoice_from_order(db, order_id)`
3. Looks up the order — if not found, returns `None` (router returns `404`)
4. Checks if an invoice already exists for this order (`invoices.order_id` has a **unique constraint**)

**Alt fragment**:
- **Order does not exist**: Returns `404 Order not found`
- **Invoice already exists**: Returns the existing invoice (idempotent — calling the endpoint multiple times is safe)
- **No invoice exists**: Creates a new invoice with:
  - Auto-generated invoice number (`INV-{8-char hex}`)
  - Status: `sent` (not `draft` — this is a design decision; invoices are generated when ready to send)
  - `total_amount` copied from `order.total_amount`
  - `due_date` = today + 15 days (configurable, defaults to 15)

**Opt fragment** (optional behaviour):
- An accountant, admin, or manager can update the invoice via `PATCH /api/invoices/{invoice_id}/status`
- Can update `paid_amount`, `status`, `due_date`
- When `paid_amount >= total_amount` (i.e., `balance_due <= 0`), the status is automatically set to `paid` and the customer's `outstanding_balance` is reduced

**Important**: The current code does **not** require a confirmed order to generate an invoice. Any existing order can have an invoice generated. The unique constraint on `invoices.order_id` ensures at most one invoice per order.

---

### DIAGRAM 8 — AI Query Sequence Diagram

**File**: `08-sequence-ai-query.mmd`
**UML diagram type**: Sequence diagram with alt fragment
**Sommerville reference**: SE10 Chapter 5, §5.3
**Implements**: `routers/ai.py`, `services/ai_service.py`, `services/report_service.py`

**Lifelines**: Staff user → React AI page → FastAPI /api/ai → ai_service.py → report_service.py → SQLAlchemy database → Configured AI provider

**Flow**:
1. User enters a business question (e.g., "What are our best-selling products?")
2. React sends `POST /api/ai/chat` with the query text
3. Router calls `ai_service.answer_query(db, current_user, query)`
4. `answer_query()` calls `report_service.build_business_snapshot(db)` which:
   - Runs `get_dashboard_metrics(db)` — aggregates sales, revenue, profit, inventory, top/bottom products, recent orders
   - Queries low-stock products (stock ≤ min_stock_level)
   - Queries total outstanding customer balance
   - Returns a structured dictionary with all this data

5. **Alt fragment**:
   - **AI provider configured and responds**: Sends the snapshot JSON (truncated to 8000 chars) + user question to Groq's LLaMA 3.1 8B with a system prompt: *"Answer only from the JSON snapshot. Never invent numbers."* Temperature is set to 0.2 (low creativity, high factual accuracy).
   - **Provider unavailable or not configured**: Uses `_fallback_answer()` which:
     - Checks for keywords: "low"/"stock"/"restock" → returns low-stock products
     - "best"/"fastest"/"selling" → returns top products by revenue
     - "least"/"worst"/"slowest" → returns bottom products
     - "compared"/"last month"/"this month" → calculates month-over-month change percentage
     - "summary"/"performance" → returns a comprehensive business summary
     - Default → returns total orders, sales, profit, and low-stock count

6. Saves the question and answer in the `ai_queries` table with `intent: "business_data"`
7. Returns the response to the frontend

**Why this design?** The AI is **grounded** — it cannot hallucinate business numbers because it only sees actual database aggregations. The fallback ensures the feature works even without an API key, which is important for:
- Demo presentations where network access may be unreliable
- Development environments without API keys
- Cost control (no API calls for simple questions)

---

### DIAGRAM 9 — Stock Adjustment Sequence Diagram

**File**: `09-sequence-stock-adjust.mmd`
**UML diagram type**: Sequence diagram with alt fragment
**Sommerville reference**: SE10 Chapter 5, §5.3
**Implements**: `routers/products.py` (line 115: `POST /{product_id}/stock`), `services/product_service.py`

**Flow**:
1. Admin or Manager enters quantity change, reason, and notes
2. React sends `POST /api/products/{product_id}/stock` with `StockAdjust` JSON body
3. Router calls `product_service.update_stock(db, product_id, quantity_change, reason, notes, user_id)`
4. Service queries the product by ID

**Alt fragment** (three outcomes):
- **Product missing**: Returns `None`, router returns `404`
- **Negative resulting stock**: `new_qty = current_stock + quantity_change` — if `new_qty < 0`, raises `ValueError("Insufficient stock")`, router returns `400`
- **Valid change**:
  - Updates `products.stock_qty` to `new_qty`
  - Creates an `inventory_movements` record with `product_id`, `quantity_change`, `reason`, `notes`, `created_by` (user_id), and `created_at` (auto-set)
  - Commits and returns the updated product

**Why track inventory movements?** Every stock change — whether from a manual adjustment, order confirmation, or order cancellation — creates an `inventory_movements` record. This provides a complete **audit trail** of how stock levels changed over time. The `reason` field distinguishes between `adjustment`, `order_confirmed`, and `order_cancelled`.

---

### DIAGRAM 10 — ER Diagram (Physical)

**File**: `10-er-diagram.mmd`
**Diagram type**: Entity-Relationship Diagram using crow's-foot notation
**Sommerville reference**: SE10 Chapter 5, §5.4 (Structural models)
**Implements**: All files in `backend/models/`

**11 tables** mapped from SQLAlchemy ORM models:

| Table | PK | Key relationships | Notes |
|-------|----|--------------------|-------|
| `roles` | id | 1 → many `users` | Four roles: admin, manager, employee, accountant |
| `users` | id | FK to `roles.id` (mandatory); 1 → many orders, expenses, ai_queries | `email` is unique; `password_hash` stores bcrypt hash |
| `customers` | id | 1 → many `orders` | `email` is unique but **nullable** — a customer can exist without email |
| `categories` | id | 0..1 → many `products` | Optional product classification |
| `products` | id | FK to `categories.id` (nullable); 1 → many order_items, inventory_movements | `sku` is unique; `is_low_stock` is a computed property |
| `orders` | id | FK to `customers.id` (mandatory), FK to `users.id` (mandatory); 1 → 1..* order_items, 1 → 0..1 invoices | `order_number` auto-generated as `ORD-{hex}` |
| `order_items` | id | FK to `orders.id` (cascade delete), FK to `products.id` | Associative entity between orders and products |
| `invoices` | id | FK to `orders.id` (**unique** — at most one invoice per order) | `invoice_number` auto-generated as `INV-{hex}` |
| `expenses` | id | FK to `users.id` (mandatory) | Independent financial records not tied to orders |
| `inventory_movements` | id | FK to `products.id` (mandatory), FK to `users.id` (**nullable**) | Audit trail for all stock changes; `created_by` is nullable because system-generated movements may not have a user |
| `ai_queries` | id | FK to `users.id` (mandatory) | Stores question, response, and classified intent |

**Key cardinalities**:
- `roles ∥--o{ users` → one role has zero or many users (mandatory role assignment)
- `orders ∥--|{ order_items` → one order has one or many items (an order must have at least one item — enforced in code)
- `orders ∥--o| invoices` → one order has zero or one invoice (unique FK enforces this)
- `categories o|--o{ products` → zero-or-one category classifies zero or many products (nullable FK)
- `users o|--o{ inventory_movements` → zero-or-one user performs zero or many movements (nullable FK)

**Normalization**: The database is in **Third Normal Form (3NF)**:
- 1NF: All columns contain atomic values
- 2NF: No partial dependencies (all non-key attributes depend on the entire primary key)
- 3NF: No transitive dependencies (e.g., `order_items.total_price` could be argued as derivable from `quantity × unit_price`, but it's stored for performance and to preserve historical prices)

---

### DIAGRAM 11 — Domain Model Class Diagram

**File**: `11-class-diagram-models.mmd`
**UML diagram type**: Class diagram (domain model)
**Sommerville reference**: SE10 Chapter 5, §5.4 (Structural models — class diagrams)
**Implements**: All files in `backend/models/`

This diagram maps directly to the SQLAlchemy ORM classes.

**Key UML notation**:
- **Visibility markers**: `+` = public, `-` = private
  - `password_hash` is marked **private** (`-`) because it should never be exposed in API responses
- **Computed properties**: `is_low_stock: bool` on Product (returns `stock_qty <= min_stock_level`), `balance_due: float` on Invoice (returns `total_amount - paid_amount`), `issue_date: DateTime` on Invoice (returns `created_at`)
- **Composition** (filled diamond ◆): `Order "1" *-- "1..*" OrderItem` — OrderItems cannot exist without their parent Order. Deleting an order cascades to delete all items (`cascade="all, delete-orphan"` in SQLAlchemy)
- **Association** (directed arrows): All other relationships are associations with navigability (e.g., `User "1" --> "0..*" Order`)

**Difference from ERD**: The ER diagram (file 10) shows the physical database structure with crow's-foot cardinality. The class diagram shows the **object-oriented domain model** with UML multiplicities and navigability. Both diagrams document the same system but from different perspectives (Sommerville SE10 §5.4).

**Audit timestamps note**: `created_at` and `updated_at` columns exist on all entities but are omitted from the class diagram for readability. They are shown in the ER diagram.

---

### DIAGRAM 12 — Module Dependency Diagram

**File**: `12-class-diagram-services.mmd`
**UML diagram type**: Package/Component dependency diagram (NOT a class diagram)
**Sommerville reference**: SE10 Chapter 6, §6.4 (Component-level design)
**Implements**: Entire `backend/` directory structure

**Why this is NOT a class diagram**: The Python implementation uses **modules with functions** (e.g., `order_service.update_order_status()`), not service classes (e.g., `OrderService.update_order_status()`). Drawing invented `AuthService` or `InvoiceService` classes would misrepresent the code. This diagram uses UML **package/component dependency** notation instead.

**Packages/Components**:
| Package | Contents | Maps to |
|---------|----------|---------|
| **routers** | auth, users, customers, products, orders, invoices, expenses, reports, ai, demo, notifications | `backend/routers/*.py` |
| **dependencies** | get_db, get_current_active_user, RoleChecker | `database.py`, `utils/deps.py`, `utils/permissions.py` |
| **service modules** | user_service, customer_service, product_service, order_service, invoice_service, expense_service, report_service, ai_service | `backend/services/*.py` |
| **models** | Role, User, Customer, Category, Product, Order, OrderItem, Invoice, Expense, InventoryMovement, AIQuery | `backend/models/*.py` |
| **schemas** | Pydantic request/response models | `backend/schemas/*.py` |
| **PDF builder** | Invoice PDF generation | `utils/pdf.py` |
| **Optional configured AI provider** | Groq API client | Imported conditionally in `ai_service.py` |

**Key cross-module dependencies**:
- `order_service.update_order_status` → `product_service.update_stock` (stock deduction on confirmation)
- `ai_service.answer_query` → `report_service.build_business_snapshot` (data grounding for AI)

---

## SOMMERVILLE SE10 MAPPING

| Sommerville Topic | Chapter | How BizAI addresses it |
|-------------------|---------|------------------------|
| Software process models | Ch. 2 | Incremental development in 8 weekly sprints |
| Requirements engineering | Ch. 4 | Use cases, user stories, functional/non-functional requirements in project documentation |
| System modelling | Ch. 5 | Use-case, sequence, class, ER, DFD, and component diagrams |
| Architectural design | Ch. 6 | Layered architecture, component decomposition, client-server pattern |
| Design and implementation | Ch. 7 | Design patterns (strategy, facade, repository, DI), implementation in Python/React |
| Software testing | Ch. 8 | API endpoint testing, integration testing with demo data simulator |
| Software evolution | Ch. 9 | Configurable database (SQLite → PostgreSQL), pluggable AI provider |

---

## COMPLETE API ENDPOINT REFERENCE

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | None | OAuth2 form login, returns JWT |
| GET | `/api/auth/me` | Bearer JWT | Returns current user profile |
| GET | `/api/users` | Admin | List all users |
| POST | `/api/users` | Admin | Create a new user |
| GET/PUT/DELETE | `/api/users/{id}` | Admin | User CRUD |
| GET | `/api/customers` | Staff | List customers (paginated, searchable) |
| POST | `/api/customers` | Employee+ | Create customer |
| GET/PUT/DELETE | `/api/customers/{id}` | Employee+ | Customer CRUD |
| GET | `/api/products` | Staff | List products (filterable by category, searchable) |
| POST | `/api/products` | Manager+ | Create product |
| GET/PUT | `/api/products/{id}` | Staff/Manager+ | Read/update product |
| POST | `/api/products/{id}/stock` | Manager+ | Manual stock adjustment |
| GET | `/api/products/low-stock` | Staff | Low-stock products |
| GET | `/api/products/categories` | Staff | List categories |
| POST | `/api/products/categories` | Manager+ | Create category |
| GET | `/api/products/history` | Staff | Inventory movement history |
| GET | `/api/orders` | Staff | List orders (filterable by status, customer) |
| POST | `/api/orders` | Employee+ | Create a new order |
| GET | `/api/orders/{id}` | Staff | Read order with items and customer |
| PATCH | `/api/orders/{id}/status` | Manager+ | Change order status |
| GET | `/api/invoices` | Staff | List invoices (filterable by status) |
| POST | `/api/invoices/from-order/{order_id}` | Staff | Generate invoice from order |
| GET | `/api/invoices/{id}` | Staff | Read invoice with order details |
| PATCH | `/api/invoices/{id}/status` | Accountant+ | Update invoice (payment, status) |
| GET | `/api/invoices/{id}/pdf` | Staff | Download invoice PDF |
| GET | `/api/expenses` | Staff | List expenses |
| POST | `/api/expenses` | Accountant+ | Create expense |
| GET/PUT/DELETE | `/api/expenses/{id}` | Accountant+ | Expense CRUD |
| GET | `/api/reports/dashboard` | Staff | Dashboard metrics |
| GET | `/api/reports/sales-series` | Staff | Daily sales time series |
| GET | `/api/reports/top-products` | Staff | Top products by revenue |
| GET | `/api/reports/customer-activity` | Staff | Customer activity ranking |
| GET | `/api/reports/expense-summary` | Staff | Expense breakdown by category |
| POST | `/api/ai/chat` | Staff | Ask AI a business question |
| GET | `/api/ai/summary` | Staff | AI-generated business summary |
| POST | `/api/demo/generate` | Admin | Generate demo data |
| DELETE | `/api/demo/clear` | Admin | Remove demo data |
| GET | `/api/notifications` | Staff | Get notifications |
| GET | `/api/health` | None | Health check |

---

## DEMONSTRATION FLOW

The recommended presentation demo follows this end-to-end scenario:

1. **Sign in** as admin → show dashboard with real metrics
2. **Create a customer** → show it appears in the customer list
3. **Create a product** with stock quantity → show inventory
4. **Create an order** → select the customer, add the product, save as pending
5. **Confirm the order** → stock automatically decreases → show inventory movement record
6. **Generate an invoice** → show the invoice with due date and balance
7. **Download invoice PDF** → show the generated PDF
8. **Record a payment** → mark invoice as paid → customer outstanding balance updated
9. **View dashboard** → show updated sales, revenue, profit charts
10. **Ask AI** "What are our best-selling products?" → AI answers using real database data
11. **Ask AI** "Give me a summary of this month's performance" → AI provides grounded summary
12. **Show role-based access** → sign in as Employee, show restricted menus and 403 when trying admin actions

This flow demonstrates the complete business workflow and all major system capabilities in a single coherent scenario.
