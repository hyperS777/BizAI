# BizAI — Complete Design Diagram Pack
**Team YATRI | Software Engineering Project**
**AI-Powered Business Management Platform**

> All diagrams below are in Mermaid syntax. Paste each block into [mermaid.live](https://mermaid.live) or draw.io's Mermaid import to render and export as PNG/PDF for your presentation.

---

## 1. System Architecture Diagram

> Shows the layered architecture: Browser -> React SPA -> FastAPI -> Services -> PostgreSQL + optional LLM.

```mermaid
flowchart TB
    subgraph Client["CLIENT LAYER — User Browser"]
        Browser["React + Vite SPA"]
        Pages["Pages: Dashboard, Customers, Products, Orders, Invoices, Reports, AI Assistant"]
        Axios["Axios HTTP Client (JWT Bearer Token)"]
    end

    subgraph Backend["BACKEND LAYER — FastAPI Server"]
        Middleware["Auth Middleware | CORS | Rate Limiter"]
        Router["API Router Layer: /auth /users /customers /products /orders /invoices /inventory /reports /ai"]
        Services["Business Logic Services: AuthService, OrderService, InvoiceService, ReportService, InventoryService, AIService"]
        ORM["Data Access Layer — SQLAlchemy ORM: Models, Repositories, Migrations"]
    end

    subgraph AI_Layer["AI LAYER — Data-Grounded Assistant"]
        AIService["AI Service: Intent Classification -> DB Query -> Answer"]
        LLM["Optional LLM Provider: Groq API / Local Model (Ollama)"]
    end

    subgraph DB_Layer["DATABASE LAYER"]
        DB[("PostgreSQL: Users, Roles, Customers, Products, Categories, Orders, OrderItems, Invoices, Expenses, AIQueryHistory")]
    end

    Browser --> Pages --> Axios
    Axios -->|REST API JSON| Middleware
    Middleware --> Router --> Services
    Services --> ORM --> DB
    Services --> AIService
    AIService -->|structured context only| LLM
    LLM -.->|grounded answer| AIService
    AIService --> DB
```

---

## 2. Use Case Diagram

> Shows the four user roles (Admin, Manager, Employee, Accountant) and which system features each can access.

```mermaid
flowchart LR
    Admin(["Admin"])
    Manager(["Manager"])
    Employee(["Employee"])
    Accountant(["Accountant"])

    subgraph BizAI["BizAI Business Management Platform"]
        Login(("Sign In"))
        ManageUsers(("Manage Users and Roles"))
        ManageCustomers(("Manage Customers"))
        ManageProducts(("Manage Products and Categories"))
        ManageInventory(("Manage Inventory and Stock Alerts"))
        CreateOrder(("Create and Manage Orders"))
        StockValidation(("Validate and Update Stock"))
        GenerateInvoice(("Generate and Manage Invoices"))
        RecordPayment(("Record Payments"))
        ViewReports(("View Reports and Analytics"))
        ViewNotifications(("View Notifications"))
        AskAI(("Ask AI Business Questions"))
    end

    Admin --> Login & ManageUsers & ManageCustomers & ManageProducts & ManageInventory
    Admin --> CreateOrder & GenerateInvoice & RecordPayment & ViewReports & ViewNotifications & AskAI

    Manager --> Login & ManageCustomers & ManageProducts & ManageInventory
    Manager --> CreateOrder & GenerateInvoice & ViewReports & ViewNotifications & AskAI

    Employee --> Login & ManageCustomers & ManageProducts & CreateOrder & ViewNotifications

    Accountant --> Login & ManageCustomers & GenerateInvoice & RecordPayment & ViewReports & ViewNotifications

    CreateOrder -.->|includes| StockValidation
    CreateOrder -.->|includes| GenerateInvoice
    AskAI -.->|uses| ViewReports
```

---

## 3. Data Flow Diagram — Context Level (Level 0)

> Shows BizAI as a single process, its external entities, and all data flows in and out.

```mermaid
flowchart LR
    Users["External Entities\n---\nAdmin | Manager\nEmployee | Accountant"]

    subgraph BizAI_System["BizAI System"]
        Process(("BizAI\nBusiness\nManagement\nPlatform"))
    end

    DB_Store["D1: PostgreSQL Database\nAll business records"]
    LLM_Ext["External LLM\nGroq API"]

    Users -->|"Credentials, Customer Data, Order Details, Queries"| Process
    Process -->|"Dashboard Reports, Invoices, AI Answers, Notifications"| Users
    Process <-->|"Read and Write Records"| DB_Store
    Process -->|"Structured Business Context"| LLM_Ext
    LLM_Ext -->|"Grounded Language Answer"| Process
```

---

## 4. Data Flow Diagram — Level 1 (Detailed)

> Breaks BizAI into its six core processes and shows how data flows between them and the data stores.

```mermaid
flowchart TB
    Input["Authenticated User Request"]
    Output["Response / Report / Notification"]

    P1(("1.0\nAuthenticate\nand Authorize"))
    P2(("2.0\nManage\nCustomers\nand Products"))
    P3(("3.0\nProcess\nOrder and\nStock"))
    P4(("4.0\nGenerate\nInvoice and\nPayment"))
    P5(("5.0\nCalculate\nReports"))
    P6(("6.0\nAnswer\nGrounded AI\nQuestion"))

    D1[("D1\nUsers and Roles")]
    D2[("D2\nCustomers\nand Products")]
    D3[("D3\nOrders and\nStock Movements")]
    D4[("D4\nInvoices and\nExpenses")]
    D5[("D5\nNotifications\nand AI History")]

    Input --> P1
    P1 <--> D1
    P1 --> P2
    P2 <--> D2
    P2 --> P3
    P3 <--> D3
    P3 --> P4
    P4 <--> D4
    D2 --> P5
    D3 --> P5
    D4 --> P5
    P5 --> Output
    Input --> P6
    D2 --> P6
    D3 --> P6
    D4 --> P6
    P6 <--> D5
    D5 --> Output
```

---

## 5. Sequence Diagram — User Login and Authentication

> Step-by-step message flow for the login process, from form submission to JWT issuance and dashboard load.

```mermaid
sequenceDiagram
    actor User
    participant UI as React Login Page
    participant API as FastAPI /auth/login
    participant Security as Password and JWT Service
    participant DB as PostgreSQL

    User->>UI: Enter email and password
    UI->>API: POST /auth/login with email and password
    API->>DB: SELECT user WHERE email matches
    DB-->>API: User record with hashed password and role
    API->>Security: bcrypt verify password against hash
    Security-->>API: Password valid
    API->>Security: create_access_token with user_id and role
    Security-->>API: JWT access token with 15 min TTL
    API-->>UI: 200 OK with access_token
    UI->>API: GET /auth/me with Authorization Bearer token
    API->>DB: SELECT user plus role WHERE id matches
    DB-->>API: User profile and permissions
    API-->>UI: Authenticated user object
    UI-->>User: Redirect to Dashboard
```

---

## 6. Sequence Diagram — Order Creation, Stock Update, and Invoice Generation

> Shows the full lifecycle of an order: creation -> confirmation (stock deducted) -> invoice generation.

```mermaid
sequenceDiagram
    actor User as Manager or Employee
    participant UI as React Orders Page
    participant API as FastAPI /orders
    participant OrderSvc as Order Service
    participant InvSvc as Invoice Service
    participant DB as PostgreSQL

    User->>UI: Select customer and add products
    UI->>API: POST /orders with customer_id and items list
    API->>OrderSvc: validate_payload with data
    OrderSvc->>DB: SELECT products WHERE id in items list
    DB-->>OrderSvc: Product records with stock_qty
    OrderSvc->>DB: INSERT into orders with status pending
    OrderSvc->>DB: INSERT into order_items list
    DB-->>OrderSvc: Draft order saved
    OrderSvc-->>API: Order object as draft
    API-->>UI: 201 Created Order ORD-001 Pending

    User->>UI: Click Confirm Order
    UI->>API: PATCH /orders/id/status with status confirmed
    API->>OrderSvc: confirm_order with order_id
    Note over OrderSvc,DB: Atomic transaction begins
    OrderSvc->>DB: UPDATE products SET stock_qty minus quantity
    OrderSvc->>DB: INSERT stock_movements with type sale
    OrderSvc->>DB: UPDATE orders SET status confirmed
    Note over OrderSvc,DB: Transaction committed
    DB-->>OrderSvc: Confirmed
    OrderSvc-->>API: Updated order
    API-->>UI: Order confirmed and stock updated

    User->>UI: Click Generate Invoice
    UI->>API: POST /invoices/from-order/id
    API->>InvSvc: create_invoice with order_id
    InvSvc->>DB: INSERT invoices with order_id and due_date and status draft
    DB-->>InvSvc: Invoice record
    InvSvc-->>API: Invoice object
    API-->>UI: Invoice INV-001 created
    UI-->>User: Invoice preview and Download PDF option
```

---

## 7. Sequence Diagram — AI Business Query (Grounded RAG-lite)

> Shows how the AI assistant answers a business question without hallucinating by querying the database first.

```mermaid
sequenceDiagram
    actor User as Admin or Manager
    participant UI as React AI Assistant
    participant API as FastAPI /ai/chat
    participant Intent as Intent Handler
    participant DB as PostgreSQL
    participant LLM as Groq LLM Optional

    User->>UI: Type "What were total sales this month?"
    UI->>API: POST /ai/chat with question and jwt_token
    API->>Intent: identify_intent with question
    Note over Intent: Pattern match identifies sales_summary intent
    Intent->>DB: SELECT SUM of total_amount FROM orders WHERE created_at this month AND status delivered
    DB-->>Intent: Result with total and order_count
    Intent->>LLM: Send structured context only with intent and data and date_range
    LLM-->>Intent: Concise language explanation
    Intent-->>API: Answer plus source_data and date_range
    API->>DB: INSERT ai_queries with user_id and question and answer
    API-->>UI: Grounded answer and source context
    UI-->>User: Display answer with advisory notice that AI answers are based on live data
```

---

## 8. Database ER Diagram (Entity-Relationship)

> Shows all database tables, their columns, and the relationships between them.

```mermaid
erDiagram
    ROLES {
        int id PK
        string name
        string description
    }

    USERS {
        int id PK
        int role_id FK
        string email
        string password_hash
        string full_name
        boolean is_active
        datetime created_at
    }

    CUSTOMERS {
        int id PK
        string name
        string email
        string phone
        string address
        string company
        string gstin
        float outstanding_balance
        datetime created_at
        datetime updated_at
    }

    CATEGORIES {
        int id PK
        string name
        string description
    }

    PRODUCTS {
        int id PK
        int category_id FK
        string name
        string sku
        string description
        float price
        float cost_price
        int stock_qty
        int min_stock_level
        boolean is_active
        datetime created_at
    }

    ORDERS {
        int id PK
        int customer_id FK
        int created_by FK
        string order_number
        string status
        float total_amount
        text notes
        datetime created_at
        datetime updated_at
    }

    ORDER_ITEMS {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
        float unit_price
        float total_price
    }

    INVOICES {
        int id PK
        int order_id FK
        string invoice_number
        string status
        float total_amount
        float paid_amount
        date due_date
        datetime created_at
    }

    EXPENSES {
        int id PK
        int created_by FK
        string description
        float amount
        string category
        date date
        datetime created_at
    }

    STOCK_MOVEMENTS {
        int id PK
        int product_id FK
        int created_by FK
        string movement_type
        int quantity
        string reason
        datetime created_at
    }

    AI_QUERIES {
        int id PK
        int user_id FK
        string query_text
        string response_text
        datetime created_at
    }

    ROLES ||--o{ USERS : "assigns role to"
    USERS ||--o{ ORDERS : "creates"
    USERS ||--o{ EXPENSES : "records"
    USERS ||--o{ AI_QUERIES : "asks"
    USERS ||--o{ STOCK_MOVEMENTS : "performs"
    CUSTOMERS ||--o{ ORDERS : "places"
    CATEGORIES ||--o{ PRODUCTS : "groups"
    ORDERS ||--|{ ORDER_ITEMS : "contains"
    PRODUCTS ||--o{ ORDER_ITEMS : "appears in"
    ORDERS ||--o| INVOICES : "generates"
    PRODUCTS ||--o{ STOCK_MOVEMENTS : "tracks changes for"
```

---

## 9. Database Normalization Evidence Table

> Included alongside the ER Diagram to prove the schema meets 1NF, 2NF, and 3NF requirements.

| Table | 1NF | 2NF | 3NF |
|---|---|---|---|
| `users` | Each column stores one atomic value; no repeating groups | Every attribute depends on the primary key id | Role name lives in roles table, not duplicated in users |
| `orders` | One order per row; order items are separated into order_items table | Each attribute depends only on order.id | Customer details stay in customers; creator details in users |
| `order_items` | One product-quantity pair per row | All fields depend on the composite identity of order plus product | Product details like name and price remain in products table |
| `products` | One SKU, price, stock value per row | All attributes depend on product.id | Category name lives in categories, linked via category_id |
| `invoices` | One payment record per row | Invoice attributes depend on invoice.id | Customer data is accessed through the linked orders table |
| `stock_movements` | One stock event per row | Event attributes depend on movement.id | Product and user details remain in their own source tables |

> Denormalization note: total_amount in orders and invoices is a maintained aggregate. This is intentional and justified because it is always recalculated from line items on insert/update and is required for invoice document stability and fast reporting queries.

---

## 10. UML Class Diagram (Code Modules)

> Shows the main Python classes (SQLAlchemy models, service classes, routers) and their relationships.

```mermaid
classDiagram
    direction TB

    class User {
        +int id
        +int role_id
        +str email
        +str password_hash
        +str full_name
        +bool is_active
        +datetime created_at
    }

    class Role {
        +int id
        +str name
        +str description
    }

    class Customer {
        +int id
        +str name
        +str email
        +str phone
        +str company
        +str gstin
        +float outstanding_balance
    }

    class Category {
        +int id
        +str name
        +str description
    }

    class Product {
        +int id
        +int category_id
        +str name
        +str sku
        +float price
        +float cost_price
        +int stock_qty
        +int min_stock_level
    }

    class Order {
        +int id
        +int customer_id
        +int created_by
        +str order_number
        +str status
        +float total_amount
        +datetime created_at
    }

    class OrderItem {
        +int id
        +int order_id
        +int product_id
        +int quantity
        +float unit_price
        +float total_price
    }

    class Invoice {
        +int id
        +int order_id
        +str invoice_number
        +str status
        +float total_amount
        +float paid_amount
        +date due_date
    }

    class Expense {
        +int id
        +int created_by
        +str description
        +float amount
        +str category
        +date date
    }

    class StockMovement {
        +int id
        +int product_id
        +str movement_type
        +int quantity
        +str reason
        +datetime created_at
    }

    class AIQuery {
        +int id
        +int user_id
        +str query_text
        +str response_text
        +datetime created_at
    }

    class AuthService {
        +verify_password(plain, hashed) bool
        +create_access_token(data) str
        +get_current_user(token) User
    }

    class OrderService {
        +create_order(data) Order
        +confirm_order(order_id) Order
        +cancel_order(order_id) Order
        +validate_stock(items) bool
        +deduct_stock(order_id) void
    }

    class InvoiceService {
        +create_from_order(order_id) Invoice
        +record_payment(invoice_id, amount) Invoice
        +generate_pdf(invoice_id) bytes
    }

    class ReportService {
        +dashboard_metrics(date_range) dict
        +sales_report(date_range) dict
        +profit_report(date_range) dict
        +top_products(limit) list
    }

    class AIService {
        +identify_intent(question) str
        +retrieve_business_data(intent) dict
        +generate_grounded_answer(context) str
    }

    Role "1" --> "0..*" User : assigns
    User "1" --> "0..*" Order : creates
    User "1" --> "0..*" Expense : records
    User "1" --> "0..*" AIQuery : asks
    Customer "1" --> "0..*" Order : places
    Category "1" --> "0..*" Product : groups
    Order "1" *-- "1..*" OrderItem : contains
    Product "1" --> "0..*" OrderItem : included in
    Order "1" --> "0..1" Invoice : generates
    Product "1" --> "0..*" StockMovement : tracks

    AuthService --> User : authenticates
    OrderService --> Order : manages
    OrderService --> OrderItem : creates
    OrderService --> StockMovement : logs
    InvoiceService --> Invoice : generates
    InvoiceService --> Order : reads
    ReportService --> Order : aggregates
    ReportService --> Product : aggregates
    AIService --> ReportService : uses
    AIService --> AIQuery : logs
```

---

*All diagrams created for BizAI — Team YATRI, Software Engineering Project 2026.*
*Paste Mermaid blocks into https://mermaid.live or import into draw.io for final rendering and export.*
