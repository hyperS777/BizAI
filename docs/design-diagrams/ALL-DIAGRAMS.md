# BizAI — Design Diagram Pack
**Team YATRI | BizAI: AI-Powered Business Management Platform**

Diagrams are organised exactly as Sir specified:
- **Section 1:** Architectural Diagram + Use Cases
- **Section 2:** Data Flow Diagram (DFD) + Sequence Diagrams (one per action flow)
- **Section 3:** Database Design — ER Diagram, RDBMS Schema Table, Normal Forms
- **Section 4:** Class Diagrams (UML) for Code Modules

> Paste any Mermaid block into **https://mermaid.live** → render → Export PNG/SVG for submission.

---

# SECTION 1 — ARCHITECTURAL DIAGRAM & USE CASES

---

## 1.1 System Architecture Diagram

Shows the four physical layers of BizAI and how they are connected.

```mermaid
flowchart TD
    subgraph CLIENT["CLIENT LAYER — User Browser"]
        UI["React + Vite Single Page Application"]
        PAGES["Pages: Dashboard | Customers | Products | Inventory\nOrders | Invoices | Reports | AI Assistant | Users | Settings"]
        AXIOS["Axios HTTP Client\nAttaches Authorization: Bearer JWT on every request"]
    end

    subgraph SERVER["SERVER LAYER — FastAPI Application"]
        MW["Middleware: JWT Auth Middleware | CORS | Rate Limiter"]
        ROUTER["API Router Layer\n/auth  /users  /customers  /products\n/orders  /invoices  /inventory  /reports  /ai"]
        SVC["Service Layer — Business Logic\nAuthService | CustomerService | ProductService\nOrderService | InvoiceService | ReportService | AIService"]
        ORM["Data Access Layer — SQLAlchemy ORM\nModels: Role | User | Customer | Category | Product\nOrder | OrderItem | Invoice | Expense\nInventoryMovement | AIQuery"]
    end

    subgraph AILAYER["AI LAYER — Data-Grounded Assistant"]
        SNAP["Business Snapshot Builder\nqueries live DB: sales, profit, stock"]
        INTENT["Intent Classifier — keyword pattern matching"]
        LLM["Optional Groq LLM (llama-3.1-8b-instant)\nreceives structured JSON context only"]
    end

    subgraph DBLAYER["DATABASE — SQLite (dev) / PostgreSQL (prod)"]
        T1["roles  |  users"]
        T2["customers  |  categories  |  products"]
        T3["orders  |  order_items"]
        T4["invoices  |  expenses"]
        T5["inventory_movements  |  ai_queries"]
    end

    UI --> PAGES --> AXIOS
    AXIOS -->|"REST API: JSON over HTTPS"| MW
    MW --> ROUTER --> SVC --> ORM
    ORM -->|"SQL queries"| DBLAYER
    DBLAYER -->|"result sets"| ORM
    SVC --> INTENT --> SNAP
    SNAP -->|"SELECT aggregates"| DBLAYER
    SNAP --> LLM
    LLM -.->|"grounded language answer"| SVC
```

---

## 1.2 Use Case Diagram

Shows all four user roles and every system feature each role is authorised to access.

```mermaid
flowchart LR
    ADMIN(["Admin"])
    MANAGER(["Manager"])
    EMPLOYEE(["Employee"])
    ACCOUNTANT(["Accountant"])

    subgraph BIZAI["BizAI Business Management Platform"]
        UC1(("Sign In and Sign Out"))
        UC2(("Manage Users and Roles"))
        UC3(("Manage Customers"))
        UC4(("Manage Products and Categories"))
        UC5(("View Inventory and Stock Alerts"))
        UC6(("Adjust Stock Manually"))
        UC7(("Create Order"))
        UC8(("Confirm or Cancel Order"))
        UC9(("Auto-Deduct Stock on Confirm"))
        UC10(("Generate Invoice from Order"))
        UC11(("Record Payment on Invoice"))
        UC12(("Download Invoice as PDF"))
        UC13(("View Dashboard and KPI Metrics"))
        UC14(("View Sales Revenue and Profit Reports"))
        UC15(("Ask AI Business Question"))
        UC16(("Manage System Settings"))
    end

    ADMIN --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8
    ADMIN --> UC10 & UC11 & UC12 & UC13 & UC14 & UC15 & UC16

    MANAGER --> UC1 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8
    MANAGER --> UC10 & UC11 & UC12 & UC13 & UC14 & UC15

    EMPLOYEE --> UC1 & UC3 & UC4 & UC5 & UC7 & UC13

    ACCOUNTANT --> UC1 & UC3 & UC11 & UC12 & UC13 & UC14

    UC7 -.->|"includes"| UC9
    UC8 -.->|"includes"| UC9
    UC10 -.->|"extends"| UC8
    UC15 -.->|"uses"| UC14
```

---

# SECTION 2 — DATA FLOW DIAGRAM & SEQUENCE DIAGRAMS

---

## 2.1 DFD — Level 0 Context Diagram

Treats BizAI as one black-box process. Shows all external actors and every data flow crossing the system boundary.

```mermaid
flowchart LR
    A1["Admin"]
    A2["Manager"]
    A3["Employee"]
    A4["Accountant"]
    GROQ["Groq LLM\n(External)"]

    subgraph SYS["BizAI System"]
        P(("0\nBizAI\nPlatform"))
    end

    DB[("D1\nPostgreSQL\nDatabase")]

    A1 -->|"login, user mgmt, orders, AI questions"| P
    A2 -->|"login, customers, products, orders, AI questions"| P
    A3 -->|"login, customers, orders"| P
    A4 -->|"login, invoice payments"| P

    P -->|"dashboard, invoices, AI answers, PDFs"| A1
    P -->|"dashboard, order status, AI answers"| A2
    P -->|"order status, stock alerts"| A3
    P -->|"invoice status, financial reports"| A4

    P <-->|"read and write business records"| DB
    P -->|"structured business JSON"| GROQ
    GROQ -->|"grounded language answer"| P
```

---

## 2.2 DFD — Level 1 Detailed Internal Processes

Expands BizAI into six internal processes and five data stores, showing all internal data flows.

```mermaid
flowchart TB
    IN["Authenticated HTTP Request"]
    OUT["HTTP Response (JSON / PDF / Report)"]

    P1(("1\nAuthenticate\nand Authorize"))
    P2(("2\nManage\nCustomers\nand Products"))
    P3(("3\nProcess Orders\nand Inventory"))
    P4(("4\nGenerate\nInvoices and\nPayments"))
    P5(("5\nBuild Reports\nand Dashboard"))
    P6(("6\nProcess AI\nBusiness Question"))

    D1[("D1\nroles\nusers")]
    D2[("D2\ncustomers\ncategories\nproducts")]
    D3[("D3\norders\norder_items\ninventory_movements")]
    D4[("D4\ninvoices\nexpenses")]
    D5[("D5\nai_queries")]

    IN --> P1
    P1 <-->|"user lookup and role"| D1
    P1 -->|"verified user context"| P2
    P1 -->|"verified user context"| P3
    P1 -->|"verified user context"| P4
    P1 -->|"verified user context"| P5
    P1 -->|"verified user context"| P6

    P2 <-->|"CRUD operations"| D2
    P2 --> OUT

    D2 -->|"product prices and stock"| P3
    P3 <-->|"orders, items, stock movements"| D3
    P3 --> OUT

    D3 -->|"confirmed order line items"| P4
    P4 <-->|"invoice and payment records"| D4
    P4 --> OUT

    D2 -->|"product sales"| P5
    D3 -->|"order totals"| P5
    D4 -->|"invoice payments and expenses"| P5
    P5 --> OUT

    D2 -->|"product snapshot"| P6
    D3 -->|"order metrics"| P6
    D4 -->|"revenue and expense snapshot"| P6
    P6 <-->|"query log and history"| D5
    P6 --> OUT
```

---

## 2.3 Sequence Diagram — User Login and Authentication

```mermaid
sequenceDiagram
    actor U as User
    participant FE as React Login Page
    participant API as FastAPI /api/auth
    participant AUTH as security.py
    participant DB as Database users table

    U->>FE: enters email and password, clicks Sign In
    FE->>API: POST /api/auth/login  body email and password
    API->>DB: SELECT FROM users WHERE email equals value
    DB-->>API: row with id, email, password_hash, role_id, is_active

    alt user not found or is_active is false
        API-->>FE: 401 Unauthorized - Invalid credentials
        FE-->>U: show error message
    else user found and active
        API->>AUTH: verify_password(plain_text, password_hash) using bcrypt
        AUTH-->>API: match is True
        API->>AUTH: create_access_token(subject=email, expires=30 min)
        AUTH-->>API: signed JWT token with 30 min expiry
        API-->>FE: 200 OK with access_token and token_type bearer
        FE->>FE: store token in memory
        FE->>API: GET /api/auth/me with Authorization Bearer token
        API->>AUTH: decode JWT, extract email
        API->>DB: SELECT users JOIN roles WHERE email equals value
        DB-->>API: full_name, email, role name, is_active
        API-->>FE: 200 OK user profile object
        FE-->>U: redirect to Dashboard
    end
```

---

## 2.4 Sequence Diagram — Create and Confirm Order with Stock Deduction

```mermaid
sequenceDiagram
    actor U as Manager or Employee
    participant FE as React Orders Page
    participant API as FastAPI POST /orders
    participant OS as order_service.py
    participant PS as product_service.py
    participant DB as Database

    Note over U,DB: PHASE 1 - Create Draft Order
    U->>FE: selects customer and adds products with quantities
    FE->>API: POST /orders with customer_id and items list
    API->>OS: create_order(data, user_id)
    OS->>DB: SELECT FROM customers WHERE id equals customer_id
    DB-->>OS: customer record or 404

    loop for each item in order
        OS->>DB: SELECT FROM products WHERE id equals product_id
        DB-->>OS: product with price, stock_qty, is_active
        OS->>OS: total_price = price multiplied by quantity
    end

    OS->>DB: INSERT INTO orders with order_number, status pending, total_amount
    OS->>DB: INSERT INTO order_items for each line item
    DB-->>OS: draft order with generated id
    OS-->>API: Order object status pending
    API-->>FE: 201 Created Order ORD-XXXXXXXX

    Note over U,DB: PHASE 2 - Confirm Order with Atomic Transaction
    U->>FE: clicks Confirm Order button
    FE->>API: PATCH /orders/id/status with status confirmed
    API->>OS: update_order_status(order_id, CONFIRMED)
    OS->>DB: BEGIN TRANSACTION

    loop for each order_item
        OS->>PS: update_stock(product_id, negative quantity, reason order_confirmed)
        PS->>DB: SELECT stock_qty FROM products WHERE id equals product_id
        alt stock_qty is less than required quantity
            PS-->>OS: raise ValueError Insufficient stock
            OS->>DB: ROLLBACK
            API-->>FE: 400 Bad Request Insufficient stock
        else stock is sufficient
            PS->>DB: UPDATE products SET stock_qty minus quantity
            PS->>DB: INSERT INTO inventory_movements with product_id, quantity_change, reason
        end
    end

    OS->>DB: UPDATE orders SET status confirmed
    OS->>DB: COMMIT
    DB-->>OS: success
    OS-->>API: confirmed Order object
    API-->>FE: 200 OK order confirmed and stock deducted
    FE-->>U: display updated order status
```

---

## 2.5 Sequence Diagram — Generate Invoice and Record Payment

```mermaid
sequenceDiagram
    actor U as Manager or Accountant
    participant FE as React Invoices Page
    participant API as FastAPI POST /invoices
    participant IS as invoice_service.py
    participant DB as Database

    Note over U,DB: PHASE 1 - Generate Invoice
    U->>FE: opens confirmed order, clicks Generate Invoice
    FE->>API: POST /invoices with order_id
    API->>IS: create_invoice(order_id, db)
    IS->>DB: SELECT FROM orders WHERE id equals order_id
    DB-->>IS: order with status, total_amount, customer_id

    alt order status is not confirmed
        IS-->>API: 400 Only confirmed orders can be invoiced
        API-->>FE: error message
    else order is confirmed
        IS->>DB: SELECT FROM invoices WHERE order_id equals value
        alt invoice already exists
            IS-->>API: 400 Invoice already exists for this order
        else no invoice yet
            IS->>IS: generate invoice_number = INV-XXXXXXXX
            IS->>DB: INSERT INTO invoices with invoice_number, order_id, total_amount, status draft, due_date
            DB-->>IS: invoice record
            IS-->>API: Invoice object
            API-->>FE: 201 Created Invoice INV-XXXXXXXX
            FE-->>U: display invoice preview
        end
    end

    Note over U,DB: PHASE 2 - Record Payment
    U->>FE: enters amount paid, clicks Record Payment
    FE->>API: PATCH /invoices/id/status with paid_amount
    API->>IS: record_payment(invoice_id, paid_amount, db)
    IS->>DB: SELECT FROM invoices WHERE id equals invoice_id
    DB-->>IS: invoice with total_amount and existing paid_amount
    IS->>IS: new_paid = existing paid_amount plus new payment

    alt new_paid is greater than or equal to total_amount
        IS->>DB: UPDATE invoices SET paid_amount and status paid
    else partial payment
        IS->>DB: UPDATE invoices SET paid_amount and status sent
    end

    DB-->>IS: updated invoice
    IS-->>API: Invoice object
    API-->>FE: 200 OK payment recorded
    FE-->>U: show updated invoice status
```

---

## 2.6 Sequence Diagram — AI Business Question (Grounded RAG)

```mermaid
sequenceDiagram
    actor U as Admin or Manager
    participant FE as React AI Assistant
    participant API as FastAPI POST /ai/chat
    participant AIS as ai_service.py
    participant RS as report_service.py
    participant DB as Database
    participant GROQ as Groq LLM External API

    U->>FE: types question e.g. What are this month sales
    FE->>API: POST /ai/chat with query text and JWT token
    API->>AIS: answer_query(db, current_user, query)
    AIS->>RS: build_business_snapshot(db)

    RS->>DB: SELECT SUM total_amount and COUNT from orders this month
    RS->>DB: SELECT SUM total_amount from orders last month
    RS->>DB: SELECT SUM profit from orders
    RS->>DB: SELECT products WHERE stock_qty less than or equal to min_stock_level
    RS->>DB: SELECT top products by revenue from order_items
    DB-->>RS: all result rows
    RS-->>AIS: structured snapshot with metrics, low_stock, top_products

    alt GROQ_API_KEY is configured
        AIS->>GROQ: POST chat completion with system prompt and snapshot JSON and query
        GROQ-->>AIS: grounded natural language answer
    else no API key fallback mode
        AIS->>AIS: _fallback_answer(query, snapshot) using keyword matching
        AIS-->>AIS: response string from snapshot data
    end

    AIS->>DB: INSERT INTO ai_queries with user_id, query_text, response_text, intent
    DB-->>AIS: saved record
    AIS-->>API: AIQuery object with response_text
    API-->>FE: 200 OK with response and created_at
    FE-->>U: display answer with notice: Answers based on live database records
```

---

## 2.7 Sequence Diagram — Manual Inventory Stock Adjustment

```mermaid
sequenceDiagram
    actor U as Admin or Manager
    participant FE as React Inventory Page
    participant API as FastAPI PUT /inventory/product_id
    participant PS as product_service.py
    participant DB as Database

    U->>FE: selects product, enters quantity change and reason
    FE->>API: PUT /inventory/product_id with quantity_change and reason

    API->>PS: update_stock(db, product_id, quantity_change, reason, user_id)
    PS->>DB: SELECT FROM products WHERE id equals product_id AND is_active is true
    DB-->>PS: product with stock_qty and min_stock_level

    alt product not found
        PS-->>API: 404 Not Found
        API-->>FE: error message
    else product found
        PS->>PS: new_qty = stock_qty plus quantity_change
        alt new_qty is less than zero
            PS-->>API: 400 Adjustment would cause negative stock
            API-->>FE: error message
        else valid adjustment
            PS->>DB: UPDATE products SET stock_qty to new_qty
            PS->>DB: INSERT INTO inventory_movements with product_id, quantity_change, reason, created_by
            DB-->>PS: updated product
            PS-->>API: product with new stock_qty
            API-->>FE: 200 OK stock updated
            FE-->>U: show new stock level, highlight if below min_stock_level
        end
    end
```

---

# SECTION 3 — DATABASE DESIGN DIAGRAMS

---

## 3.1 ER Diagram — Entity Relationship Diagram

Shows all 11 tables, every column with data type and constraint, and all relationships with cardinality.

```mermaid
erDiagram
    roles {
        INTEGER id PK
        VARCHAR_50 name "UNIQUE NOT NULL"
        VARCHAR_200 description "nullable"
    }

    users {
        INTEGER id PK
        VARCHAR_255 email "UNIQUE NOT NULL INDEXED"
        VARCHAR_255 password_hash "NOT NULL"
        VARCHAR_150 full_name "NOT NULL"
        INTEGER role_id FK
        BOOLEAN is_active "DEFAULT true"
        TIMESTAMP created_at "server default now"
        TIMESTAMP updated_at "onupdate now"
    }

    customers {
        INTEGER id PK
        VARCHAR_150 name "NOT NULL"
        VARCHAR_255 email "UNIQUE nullable"
        VARCHAR_20 phone "nullable"
        TEXT address "nullable"
        VARCHAR_200 company "nullable"
        VARCHAR_20 gstin "nullable"
        FLOAT outstanding_balance "DEFAULT 0.0"
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    categories {
        INTEGER id PK
        VARCHAR_100 name "UNIQUE NOT NULL"
        VARCHAR_300 description "nullable"
    }

    products {
        INTEGER id PK
        VARCHAR_200 name "NOT NULL"
        VARCHAR_50 sku "UNIQUE NOT NULL"
        TEXT description "nullable"
        FLOAT price "NOT NULL selling price"
        FLOAT cost_price "NOT NULL purchase price"
        INTEGER stock_qty "DEFAULT 0"
        INTEGER min_stock_level "DEFAULT 10"
        INTEGER category_id FK
        BOOLEAN is_active "DEFAULT true"
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    orders {
        INTEGER id PK
        VARCHAR_50 order_number "UNIQUE NOT NULL INDEXED"
        INTEGER customer_id FK
        INTEGER created_by FK
        VARCHAR_20 status "pending confirmed shipped delivered cancelled"
        FLOAT total_amount "DEFAULT 0.0"
        TEXT notes "nullable"
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    order_items {
        INTEGER id PK
        INTEGER order_id FK
        INTEGER product_id FK
        INTEGER quantity "NOT NULL"
        FLOAT unit_price "NOT NULL price snapshot at order time"
        FLOAT total_price "NOT NULL unit_price x quantity"
    }

    invoices {
        INTEGER id PK
        VARCHAR_50 invoice_number "UNIQUE NOT NULL INDEXED"
        INTEGER order_id FK "UNIQUE one per order"
        VARCHAR_20 status "draft sent paid overdue cancelled"
        FLOAT total_amount "NOT NULL"
        FLOAT paid_amount "DEFAULT 0.0"
        DATE due_date "nullable"
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    expenses {
        INTEGER id PK
        VARCHAR_300 description "NOT NULL"
        FLOAT amount "NOT NULL"
        VARCHAR_100 category "nullable"
        DATE date "NOT NULL"
        TEXT notes "nullable"
        INTEGER created_by FK
        TIMESTAMP created_at
    }

    inventory_movements {
        INTEGER id PK
        INTEGER product_id FK
        INTEGER quantity_change "NOT NULL negative means reduction"
        VARCHAR_100 reason "order_confirmed order_cancelled manual"
        TEXT notes "nullable"
        INTEGER created_by FK
        TIMESTAMP created_at
    }

    ai_queries {
        INTEGER id PK
        INTEGER user_id FK
        TEXT query_text "NOT NULL"
        TEXT response_text "NOT NULL"
        VARCHAR_100 intent "nullable"
        TIMESTAMP created_at
    }

    roles         ||--o{ users               : "assigns role to"
    users         ||--o{ orders              : "creates"
    users         ||--o{ expenses            : "records"
    users         ||--o{ ai_queries          : "asks"
    users         ||--o{ inventory_movements : "performs"
    customers     ||--o{ orders              : "places"
    categories    ||--o{ products            : "groups"
    orders        ||--|{ order_items         : "contains"
    products      ||--o{ order_items         : "appears in"
    orders        ||--o| invoices            : "generates one"
    products      ||--o{ inventory_movements : "stock tracked by"
```

---

## 3.2 RDBMS Schema Table (Physical Database Design)

| Table | Column | Data Type | Constraint |
|---|---|---|---|
| **roles** | id | INTEGER | PRIMARY KEY |
| | name | VARCHAR(50) | UNIQUE, NOT NULL |
| | description | VARCHAR(200) | NULLABLE |
| **users** | id | INTEGER | PRIMARY KEY |
| | email | VARCHAR(255) | UNIQUE, NOT NULL, INDEXED |
| | password_hash | VARCHAR(255) | NOT NULL |
| | full_name | VARCHAR(150) | NOT NULL |
| | role_id | INTEGER | FK → roles.id, NOT NULL |
| | is_active | BOOLEAN | DEFAULT TRUE |
| | created_at | TIMESTAMP | server_default = NOW() |
| | updated_at | TIMESTAMP | onupdate = NOW() |
| **customers** | id | INTEGER | PRIMARY KEY |
| | name | VARCHAR(150) | NOT NULL |
| | email | VARCHAR(255) | UNIQUE, NULLABLE |
| | phone | VARCHAR(20) | NULLABLE |
| | address | TEXT | NULLABLE |
| | company | VARCHAR(200) | NULLABLE |
| | gstin | VARCHAR(20) | NULLABLE |
| | outstanding_balance | FLOAT | DEFAULT 0.0 |
| | created_at / updated_at | TIMESTAMP | auto-managed |
| **categories** | id | INTEGER | PRIMARY KEY |
| | name | VARCHAR(100) | UNIQUE, NOT NULL |
| | description | VARCHAR(300) | NULLABLE |
| **products** | id | INTEGER | PRIMARY KEY |
| | name | VARCHAR(200) | NOT NULL |
| | sku | VARCHAR(50) | UNIQUE, NOT NULL |
| | description | TEXT | NULLABLE |
| | price | FLOAT | NOT NULL (selling price) |
| | cost_price | FLOAT | NOT NULL (purchase price) |
| | stock_qty | INTEGER | DEFAULT 0 |
| | min_stock_level | INTEGER | DEFAULT 10 |
| | category_id | INTEGER | FK → categories.id, NULLABLE |
| | is_active | BOOLEAN | DEFAULT TRUE |
| | created_at / updated_at | TIMESTAMP | auto-managed |
| **orders** | id | INTEGER | PRIMARY KEY |
| | order_number | VARCHAR(50) | UNIQUE, NOT NULL, INDEXED |
| | customer_id | INTEGER | FK → customers.id, NOT NULL |
| | created_by | INTEGER | FK → users.id, NOT NULL |
| | status | VARCHAR(20) | pending/confirmed/shipped/delivered/cancelled |
| | total_amount | FLOAT | DEFAULT 0.0 |
| | notes | TEXT | NULLABLE |
| | created_at / updated_at | TIMESTAMP | auto-managed |
| **order_items** | id | INTEGER | PRIMARY KEY |
| | order_id | INTEGER | FK → orders.id, CASCADE DELETE |
| | product_id | INTEGER | FK → products.id, NOT NULL |
| | quantity | INTEGER | NOT NULL |
| | unit_price | FLOAT | NOT NULL (price snapshot at time of order) |
| | total_price | FLOAT | NOT NULL (unit_price × quantity) |
| **invoices** | id | INTEGER | PRIMARY KEY |
| | invoice_number | VARCHAR(50) | UNIQUE, NOT NULL, INDEXED |
| | order_id | INTEGER | FK → orders.id, UNIQUE (one invoice per order) |
| | status | VARCHAR(20) | draft/sent/paid/overdue/cancelled |
| | total_amount | FLOAT | NOT NULL |
| | paid_amount | FLOAT | DEFAULT 0.0 |
| | due_date | DATE | NULLABLE |
| | created_at / updated_at | TIMESTAMP | auto-managed |
| **expenses** | id | INTEGER | PRIMARY KEY |
| | description | VARCHAR(300) | NOT NULL |
| | amount | FLOAT | NOT NULL |
| | category | VARCHAR(100) | NULLABLE |
| | date | DATE | NOT NULL |
| | notes | TEXT | NULLABLE |
| | created_by | INTEGER | FK → users.id, NOT NULL |
| | created_at | TIMESTAMP | auto-managed |
| **inventory_movements** | id | INTEGER | PRIMARY KEY |
| | product_id | INTEGER | FK → products.id, NOT NULL |
| | quantity_change | INTEGER | NOT NULL (negative = stock reduction) |
| | reason | VARCHAR(100) | order_confirmed / order_cancelled / manual |
| | notes | TEXT | NULLABLE |
| | created_by | INTEGER | FK → users.id, NULLABLE |
| | created_at | TIMESTAMP | auto-managed |
| **ai_queries** | id | INTEGER | PRIMARY KEY |
| | user_id | INTEGER | FK → users.id, NOT NULL |
| | query_text | TEXT | NOT NULL |
| | response_text | TEXT | NOT NULL |
| | intent | VARCHAR(100) | NULLABLE |
| | created_at | TIMESTAMP | auto-managed |

---

## 3.3 Normal Form Evidence Table

| Table | 1NF | 2NF | 3NF |
|---|---|---|---|
| **orders** | Each column holds one atomic value. Line items are in order_items — no repeating groups in orders. | All non-key columns (status, total_amount, notes) depend only on orders.id. No partial dependencies. | Customer name is not in orders — accessed via customer_id FK. User details via created_by FK. No transitive dependencies. |
| **order_items** | One product-quantity pair per row. No arrays or lists. | quantity, unit_price, total_price all depend fully on the identity {order_id, product_id}. | unit_price is a price snapshot stored at order time. Product details (name, current price) live in products. No transitive dep. |
| **products** | Each column holds one value: one price, one SKU, one stock count. | All attributes depend solely on products.id. | category name lives in categories, referenced by category_id FK. No non-key attribute depends on another. |
| **invoices** | One payment record per row. balance_due is a computed property — not a stored column. | invoice_number, total_amount, paid_amount, status all depend on invoices.id. | Customer/order data is accessed through order_id FK — not duplicated inside invoices. |
| **inventory_movements** | One stock-change event per row with a single quantity_change. | quantity_change, reason, notes all depend only on inventory_movements.id. | Product info remains in products; user info remains in users. No transitive dependency in this table. |
| **users** | One user per row. Role is referenced by role_id, not stored as text. | All user attributes depend only on users.id. | Role name and description live in roles table, not in users. |
| **expenses** | One expense per row with atomic amount and date. | All attributes depend only on expenses.id. | Created-by user details remain in users, referenced by FK. |

> **Denormalisation note:** total_amount in orders and invoices is a calculated aggregate stored as a column. This is a deliberate and justified engineering decision — the value is always recalculated fresh on insert/update from order_items, and is required for invoice document stability (product prices can change after the order is placed) and for fast report aggregations without joining order_items on every dashboard query.

---

# SECTION 4 — CLASS DIAGRAMS (UML)

---

## 4.1 UML Class Diagram — Data Model Classes

All 11 SQLAlchemy ORM model classes with exact attributes (from /backend/models/) and relationships.

```mermaid
classDiagram
    direction TB

    class Role {
        +Integer id
        +String name
        +String description
        +List~User~ users
    }

    class User {
        +Integer id
        +String email
        +String password_hash
        +String full_name
        +Integer role_id
        +Boolean is_active
        +DateTime created_at
        +DateTime updated_at
    }

    class Customer {
        +Integer id
        +String name
        +String email
        +String phone
        +String address
        +String company
        +String gstin
        +Float outstanding_balance
        +DateTime created_at
        +DateTime updated_at
    }

    class Category {
        +Integer id
        +String name
        +String description
    }

    class Product {
        +Integer id
        +String name
        +String sku
        +String description
        +Float price
        +Float cost_price
        +Integer stock_qty
        +Integer min_stock_level
        +Integer category_id
        +Boolean is_active
        +DateTime created_at
        +DateTime updated_at
        +is_low_stock() bool
    }

    class Order {
        +Integer id
        +String order_number
        +Integer customer_id
        +Integer created_by
        +String status
        +Float total_amount
        +String notes
        +DateTime created_at
        +DateTime updated_at
    }

    class OrderItem {
        +Integer id
        +Integer order_id
        +Integer product_id
        +Integer quantity
        +Float unit_price
        +Float total_price
    }

    class Invoice {
        +Integer id
        +String invoice_number
        +Integer order_id
        +String status
        +Float total_amount
        +Float paid_amount
        +Date due_date
        +DateTime created_at
        +DateTime updated_at
        +balance_due() float
        +issue_date() DateTime
    }

    class Expense {
        +Integer id
        +String description
        +Float amount
        +String category
        +Date date
        +String notes
        +Integer created_by
        +DateTime created_at
    }

    class InventoryMovement {
        +Integer id
        +Integer product_id
        +Integer quantity_change
        +String reason
        +String notes
        +Integer created_by
        +DateTime created_at
    }

    class AIQuery {
        +Integer id
        +Integer user_id
        +String query_text
        +String response_text
        +String intent
        +DateTime created_at
    }

    Role "1" --> "0..*" User : assigns role to
    User "1" --> "0..*" Order : creates
    User "1" --> "0..*" Expense : records
    User "1" --> "0..*" AIQuery : asks
    User "1" --> "0..*" InventoryMovement : performs
    Customer "1" --> "0..*" Order : places
    Category "1" --> "0..*" Product : groups
    Order "1" *-- "1..*" OrderItem : contains
    Product "1" --> "0..*" OrderItem : appears in
    Order "1" --> "0..1" Invoice : generates
    Product "1" --> "0..*" InventoryMovement : stock tracked by
```

---

## 4.2 UML Class Diagram — Service Layer (Business Logic)

All service classes with their public methods and dependencies on model classes.

```mermaid
classDiagram
    direction TB

    class AuthService {
        +verify_password(plain str, hashed str) bool
        +create_access_token(data dict) str
        +get_current_user(token str, db Session) User
    }

    class UserService {
        +get_user(db Session, user_id int) User
        +get_users(db Session, skip int, limit int) List~User~
        +create_user(db Session, data) User
        +update_user(db Session, user_id int, data) User
        +deactivate_user(db Session, user_id int) User
    }

    class CustomerService {
        +get_customer(db Session, customer_id int) Customer
        +get_customers(db Session, skip int, limit int, search str) List~Customer~
        +create_customer(db Session, data) Customer
        +update_customer(db Session, customer_id int, data) Customer
        +delete_customer(db Session, customer_id int) bool
    }

    class ProductService {
        +get_product(db Session, product_id int) Product
        +get_products(db Session, skip int, limit int, category_id int) List~Product~
        +create_product(db Session, data) Product
        +update_product(db Session, product_id int, data) Product
        +update_stock(db Session, product_id int, qty_change int, reason str, user_id int) Product
    }

    class OrderService {
        +get_order(db Session, order_id int) Order
        +get_orders(db Session, skip int, limit int, status str, customer_id int) List~Order~
        +create_order(db Session, data OrderCreate, user_id int) Order
        +update_order_status(db Session, order_id int, status OrderStatus) Order
    }

    class InvoiceService {
        +get_invoice(db Session, invoice_id int) Invoice
        +get_invoices(db Session, skip int, limit int, status str) List~Invoice~
        +create_invoice(db Session, data) Invoice
        +record_payment(db Session, invoice_id int, paid_amount float) Invoice
        +generate_pdf(invoice_id int) bytes
    }

    class ReportService {
        +build_business_snapshot(db Session) dict
        +get_sales_summary(db Session, date_range) dict
        +get_revenue_profit(db Session, date_range) dict
        +get_top_products(db Session, limit int) list
        +get_inventory_summary(db Session) dict
    }

    class AIService {
        +answer_query(db Session, user User, query str) AIQuery
        +business_summary(db Session) dict
        -_fallback_answer(query str, snapshot dict) str
        -_ask_model(query str, snapshot dict) str
    }

    AuthService --> User : authenticates
    UserService --> User : manages
    CustomerService --> Customer : manages
    ProductService --> Product : manages
    ProductService --> InventoryMovement : logs stock changes
    OrderService --> Order : manages
    OrderService --> OrderItem : creates line items
    OrderService --> ProductService : calls update_stock()
    InvoiceService --> Invoice : manages
    InvoiceService --> Order : reads order data
    ReportService --> Order : aggregates
    ReportService --> OrderItem : aggregates
    ReportService --> Invoice : aggregates
    ReportService --> Product : aggregates
    ReportService --> Expense : aggregates
    AIService --> ReportService : calls build_business_snapshot()
    AIService --> AIQuery : persists query log
```

---

*BizAI — Team YATRI | Software Engineering Project 2026*
*All diagrams derived directly from /backend/models/ and /backend/services/ source files.*
*Render at https://mermaid.live — Export PNG/SVG for submission to Sir.*
