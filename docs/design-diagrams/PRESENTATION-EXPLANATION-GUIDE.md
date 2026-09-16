# BizAI — Diagram Explanation Guide
### What to say to Sir for every diagram — Team YATRI

> This file is written so any team member can pick it up, read their section, and speak confidently during the presentation. Follow the order below.

---

## Presentation Order (match exactly what Sir asked for)

| # | Diagram | Sir's Category |
|---|---|---|
| 1 | System Architecture | Architectural Diagram for the System |
| 2 | Use Case | Use Cases for different requirements |
| 3 | DFD Level 0 — Context | Data Flow Diagram |
| 4 | DFD Level 1 — Detailed | Data Flow Diagram |
| 5 | Sequence — Login | Sequence Diagrams for each action flow |
| 6 | Sequence — Create and Confirm Order | Sequence Diagrams for each action flow |
| 7 | Sequence — Generate Invoice and Payment | Sequence Diagrams for each action flow |
| 8 | Sequence — AI Business Question | Sequence Diagrams for each action flow |
| 9 | Sequence — Manual Stock Adjustment | Sequence Diagrams for each action flow |
| 10 | ER Diagram | Database Design — ER Diagram |
| 11 | RDBMS Schema Table | Database Design — RDBMS schema and table |
| 12 | Normal Form Table | Database Design — show the NF in table |
| 13 | UML Class Diagram — Models | Class Diagrams for Code Modules |
| 14 | UML Class Diagram — Services | Class Diagrams for Code Modules |

---

## DIAGRAM 1 — System Architecture Diagram

### What this diagram shows
The full physical and logical structure of BizAI split into four layers:
Client Layer (browser), Server Layer (FastAPI), AI Layer (grounded assistant), and Database Layer (SQLite/PostgreSQL).

### What each box means
| Box / Label | Meaning |
|---|---|
| React + Vite SPA | The website running in the user's browser. Vite is the build tool — it makes the app fast to load. |
| Pages (Dashboard, Orders, etc.) | Each page is a React component. The user navigates between them without the page refreshing because it is a Single Page Application. |
| Axios HTTP Client | The JavaScript library that sends all requests to the backend. Every request automatically includes the JWT token in the Authorization header. |
| JWT Auth Middleware | The first thing the server checks — is this token valid? If not, the request is rejected with 401 before it reaches any code. |
| CORS | Cross-Origin Resource Sharing — allows the browser at localhost:5173 to talk to the server at localhost:8000. |
| Rate Limiter | Prevents abuse — if someone sends thousands of requests per second, they get blocked. |
| API Router Layer | Routes the incoming URL to the right Python function. /orders goes to the orders router, /auth goes to the auth router, etc. |
| Service Layer | Contains all business rules. For example: you cannot confirm an order if stock is insufficient. This logic lives here, not in the router. |
| SQLAlchemy ORM | Converts Python class objects into SQL statements. We never write raw SQL — SQLAlchemy generates it. |
| Business Snapshot Builder | Queries the database for key metrics — monthly sales, profit, low-stock products, top products. This is the data the AI uses. |
| Intent Classifier | Reads the user's question and identifies what they are asking — is it about sales, stock, or profit? |
| Groq LLM | An optional external AI model. It receives only the pre-queried structured data and formats it into a readable sentence. It cannot access the database directly. |
| SQLite / PostgreSQL | The database. SQLite is used locally during development, PostgreSQL is used in production. SQLAlchemy works with both. |

### What to say out loud
"BizAI is built in four layers. The user opens a React website in their browser. When they take any action — logging in, creating an order, or asking an AI question — Axios sends a secure HTTPS request with a JWT token to the FastAPI server. The server first validates the token in the middleware, then routes the request to the correct service. Services contain all business rules. They use SQLAlchemy ORM to read and write the PostgreSQL database. When an AI question is asked, the system first queries the real database for exact figures, and only then sends that structured data to the optional Groq language model to format the answer. The key point is that the AI never has direct database access — it only receives the result of a specific query."

---

## DIAGRAM 2 — Use Case Diagram

### What this diagram shows
Who uses the system and what each role is allowed to do. The four oval shapes around the edge are actors (real people). The circles inside the box are use cases (features of the system).

### What each actor can access
| Role | What they can do |
|---|---|
| Admin | Everything — users, roles, customers, products, inventory, orders, invoices, payments, reports, AI, settings |
| Manager | Operations — customers, products, inventory, orders, invoices, payments, reports, AI |
| Employee | Day-to-day — customers, products, inventory, creating orders, dashboard |
| Accountant | Finance only — recording payments, downloading invoice PDFs, viewing reports |

### What the dashed arrows mean
- **includes** means the use case always triggers another one automatically. Creating an order includes auto-deducting stock on confirmation — this always happens, the user cannot skip it.
- **extends** means one use case can optionally add to another. Generating an invoice extends the confirm order flow — it is not automatic, the user does it manually after confirming.
- **uses** means one use case internally relies on another. The AI assistant uses the same reports data to answer questions.

### What to say out loud
"This is our Use Case Diagram. The four actors are the people who use BizAI — Admin, Manager, Employee, and Accountant. Each circle is a feature of the system. The lines show which role can access which feature. This is called Role-Based Access Control. For example, only the Admin can manage users and system settings. The Accountant can only handle invoices and payments — they cannot create orders or manage products. The dashed arrows show dependencies — when a Manager confirms an order, stock deduction happens automatically as part of that use case. This diagram proves our system is designed around real business roles, not one generic user."

---

## DIAGRAM 3 — DFD Level 0 — Context Diagram

### What this diagram shows
The system as one single black box. It shows everything that enters the system from outside and everything the system sends back out. This is called a Context Diagram or Level 0 DFD.

### What each element means
| Element | What it is |
|---|---|
| Admin, Manager, Employee, Accountant | External entities — people outside the system boundary |
| BizAI Platform (the circle) | The entire system treated as a single process |
| PostgreSQL Database | The data store — shown outside the process to show data persists |
| Groq LLM | An external service outside the system boundary |
| Arrows with labels | Data flows — what information crosses the boundary and in which direction |

### What to say out loud
"This is our Level 0 DFD — also called the Context Diagram. At this level we do not show the internal workings of the system. We just show what goes in and what comes out. The four actors send credentials, business data, and questions into the system. The system sends back dashboards, invoices, AI answers, and PDFs. The system reads and writes to the PostgreSQL database. When an AI question is asked, the system sends only structured JSON — not raw database data — to the external Groq LLM. This diagram establishes the boundary of our system and all external interactions."

---

## DIAGRAM 4 — DFD Level 1 — Detailed Internal Processes

### What this diagram shows
It opens up the BizAI black box and shows the six internal processes and five data stores. The arrows show how data flows between each process and store.

### What each process does
| Process | Responsibility |
|---|---|
| 1 — Authenticate and Authorize | Verifies the JWT token, loads the user and role, passes the verified user context to all other processes |
| 2 — Manage Customers and Products | All CRUD operations: create, read, update, delete for customers, products, and categories |
| 3 — Process Orders and Inventory | Creates orders, deducts stock on confirmation, logs all inventory movements |
| 4 — Generate Invoices and Payments | Creates invoices from confirmed orders, records partial and full payments |
| 5 — Build Reports and Dashboard | Aggregates data from multiple stores to produce KPI metrics, sales charts, and profit reports |
| 6 — Process AI Business Question | Builds a live data snapshot, classifies intent, calls the LLM, logs the query |

### What each data store holds
| Store | Contents |
|---|---|
| D1 roles and users | Login credentials, role assignments |
| D2 customers, categories, products | All customer records and product catalog |
| D3 orders, order_items, inventory_movements | Order history, line items, every stock change |
| D4 invoices, expenses | Invoice records with payment status, business expenses |
| D5 ai_queries | History of every AI question and answer |

### What to say out loud
"This is our Level 1 DFD. It breaks the system into six processes. Every request first goes through Process 1 — authentication. Without a valid JWT token, nothing else runs. Process 3 is the most critical — when a Manager confirms an order, this process atomically deducts stock and logs an inventory movement in the same database transaction. Process 6 — the AI process — is independent. It can read from all five data stores to build a snapshot and answer any supported business question. This diagram proves our system has no isolated or disconnected components — every process has a defined input, output, and data store."

---

## DIAGRAM 5 — Sequence Diagram — Login and Authentication

### What this diagram shows
The exact sequence of messages between the user, the React frontend, the FastAPI backend, the security service, and the database when a user logs in.

### Step by step
1. User enters email and password and clicks Sign In
2. React sends a POST request to /auth/login
3. The backend searches the users table for that email
4. If the user is not found or is_active is false, a 401 error is returned immediately
5. If found, bcrypt verifies the password against the stored hash — passwords are never stored in plain text
6. The backend creates a JWT token signed with the user's email, expiring in 30 minutes
7. The token is returned to the frontend
8. The frontend immediately calls /auth/me with the token in the header
9. The backend decodes the token, loads the full user profile, and returns it
10. The frontend stores the profile and redirects to the Dashboard

### Key technical point — why JWT and not sessions
Sessions require the server to store state for every logged-in user. JWT is stateless — all information is inside the token itself. This means the server can handle thousands of users without a session table.

### What to say out loud
"This is the Login Sequence Diagram. A sequence diagram shows messages between system components in time order, from top to bottom. The login process has two parts — first we verify the credentials and issue a JWT token, then we load the user profile with that token. We use bcrypt for password hashing — this is the industry standard. Even if the database is leaked, the passwords cannot be recovered because bcrypt is a one-way hash. The JWT token contains the user's email and expires in 30 minutes. Every other API call checks this token before doing anything."

---

## DIAGRAM 6 — Sequence Diagram — Create and Confirm Order with Stock Deduction

### What this diagram shows
The most important business workflow in BizAI — how an order goes from draft to confirmed with automatic, atomic stock deduction.

### Phase 1 — Create Draft Order
The Manager selects a customer and products. The system validates the customer exists, fetches current product prices, calculates totals, and saves the order with status pending.

### Phase 2 — Confirm Order (the critical part)
When the Manager clicks Confirm, the system starts a database transaction. Inside this transaction it: subtracts the ordered quantity from each product's stock, logs an inventory_movement record for each product, then updates the order status to confirmed. Only if all steps succeed does the transaction commit. If anything fails — for example stock is insufficient — the entire transaction rolls back. No partial changes are saved.

### Why atomic transactions matter
If the server crashes after deducting stock for one product but before deducting for the next, you would have corrupted inventory data. Transactions prevent this.

### What to say out loud
"This is the Order Flow Sequence Diagram. It has two phases. Phase 1 creates a draft order — this is safe and reversible. Phase 2 is the critical confirmation step. When the Manager confirms the order, our system uses a database transaction to atomically deduct stock for every item in the order. Atomic means all-or-nothing — either every stock deduction succeeds and the order is confirmed, or if anything fails the entire operation is rolled back and no data is changed. Every stock change is logged in the inventory_movements table for auditing. This is how professional inventory management systems work."

---

## DIAGRAM 7 — Sequence Diagram — Generate Invoice and Record Payment

### What this diagram shows
How an invoice is created from a confirmed order and how payments are recorded against it.

### Phase 1 — Generate Invoice
The system checks that the order status is confirmed before allowing an invoice. It also checks that no invoice already exists for this order — the system enforces a strict one-invoice-per-order rule using a UNIQUE constraint on order_id in the invoices table.

### Phase 2 — Record Payment
The Accountant enters the payment amount. The system adds it to any existing paid_amount. If the total paid equals or exceeds the invoice amount, the status becomes paid. If it is a partial payment, the status becomes sent. This supports installment payments.

### What to say out loud
"This is the Invoice Sequence Diagram. Invoices in BizAI can only be created from a confirmed order — you cannot invoice a pending or cancelled order. We enforce a one-to-one relationship in the database using a UNIQUE constraint on the order_id column in the invoices table. The payment recording system supports both full payment and installment payments. The system automatically updates the invoice status based on how much has been paid."

---

## DIAGRAM 8 — Sequence Diagram — AI Business Question

### What this diagram shows
How BizAI's AI assistant answers a business question without hallucinating or inventing numbers — by always querying the real database first.

### How it works step by step
1. Manager types a question like "What are this month's sales?"
2. The system calls build_business_snapshot(db) which runs several specific SQL queries on live data
3. The snapshot contains real numbers — actual totals, counts, product rankings, low-stock items
4. If a Groq API key is configured, this structured JSON is sent to the Groq LLM which formats it into a readable sentence
5. If no API key, a fallback function uses keyword matching to compose an answer from the snapshot data
6. The question and answer are saved to the ai_queries table
7. The frontend shows the answer with a notice that it is based on live data

### What makes this different from ChatGPT
ChatGPT would have to be told the business data in the prompt — and it might still make up numbers. BizAI's AI runs real SQL queries and only shows numbers that actually exist in the database. It cannot hallucinate because it only formats data that was just retrieved.

### What to say out loud
"This is the AI Query Sequence Diagram. Our AI assistant is what we call data-grounded. When you ask a business question, the system does not guess — it runs actual SQL queries against the live database to get exact figures, and then formats those figures into a readable answer. The language model only receives structured JSON — it does not have a connection to the database. This architecture is called RAG-lite — Retrieval-Augmented Generation. The retrieval step happens first and grounds every answer in real data. Every AI interaction is also logged in the ai_queries table so users can review their query history."

---

## DIAGRAM 9 — Sequence Diagram — Manual Stock Adjustment

### What this diagram shows
How an Admin or Manager manually adjusts the stock quantity of a product — for example when new stock arrives or when stock is damaged.

### What happens
1. Manager enters the product, the quantity change (positive to add, negative to remove), and a reason
2. The system checks the product exists and is active
3. It calculates the new stock: current stock plus the change
4. If the result would be negative, the request is rejected
5. If valid, it updates the product's stock_qty and logs an inventory_movement record
6. The frontend shows the updated stock level, highlighted in red if it is below the minimum stock level

### What to say out loud
"This is the Manual Stock Adjustment Sequence Diagram. In a real business, stock changes happen for many reasons — new deliveries, damaged goods, theft, or corrections. This diagram shows how managers can manually adjust stock levels. Every manual adjustment is logged in the inventory_movements table with a reason and the user who made the change, creating a full audit trail. The system prevents stock from going below zero, and it automatically alerts the user if the new stock level is at or below the configured minimum."

---

## DIAGRAM 10 — ER Diagram (Entity-Relationship)

### What this diagram shows
All 11 database tables, every column with its data type and constraint, and the relationships between tables with their cardinality.

### The 11 tables and what they hold
| Table | Purpose |
|---|---|
| roles | Defines the four user types: admin, manager, employee, accountant |
| users | All system users with hashed passwords and role assignment |
| customers | Business customers with contact details and outstanding balance |
| categories | Product groupings like Electronics, Clothing, Food |
| products | All products with selling price, cost price, stock quantity, and minimum level |
| orders | Order headers with customer, status, and total amount |
| order_items | Individual line items — one row per product in each order |
| invoices | Invoice linked to one confirmed order — tracks payment status |
| expenses | Business expenses like rent, utilities, supplies |
| inventory_movements | Every stock change event with reason and user who made it |
| ai_queries | Full history of every AI question and its answer |

### What the ER symbols mean
- `||--o{` — One to Many. One customer places many orders.
- `||--|{` — One to Many mandatory. One order must contain at least one order item.
- `||--o|` — One to One optional. One order generates at most one invoice.

### What to say out loud
"This is our Entity-Relationship Diagram. It shows all 11 tables in our database. I will walk through the main relationships. The roles table assigns a role to each user — one role to many users. Customers place orders — one customer to many orders. Each order contains at least one order item — a mandatory one-to-many relationship. Each order item references a product, creating a many-to-many relationship between orders and products through the order_items junction table. A confirmed order generates exactly one invoice — a one-to-one relationship enforced by a UNIQUE constraint on the order_id column. The inventory_movements table tracks every stock change, and the ai_queries table stores every AI question for audit purposes."

---

## DIAGRAM 11 — RDBMS Schema Table (Physical Design)

### What this diagram shows
The exact column-by-column definition of every table as it exists in the database — column names, data types, and constraints. This is the physical database design.

### Key constraints to explain
| Constraint | Example | What it enforces |
|---|---|---|
| PRIMARY KEY | orders.id | Every row has a unique identifier |
| UNIQUE | users.email | No two users can share the same email |
| NOT NULL | orders.customer_id | A column that cannot be left empty |
| FOREIGN KEY | orders.customer_id → customers.id | Referential integrity — orders must point to a real customer |
| DEFAULT | products.stock_qty DEFAULT 0 | The value if nothing is specified |
| CASCADE DELETE | order_items.order_id | When an order is deleted, all its items are deleted automatically |

### What to say out loud
"This is the RDBMS Schema Table. It shows the physical design of every table — the exact column names, data types, and constraints as they are implemented in our SQLAlchemy models. Key constraints include UNIQUE on email fields to prevent duplicate accounts, NOT NULL on required fields like customer_id in orders, and a UNIQUE constraint on order_id in the invoices table which enforces our one-invoice-per-order rule at the database level, not just in application code. CASCADE DELETE on order_items means if an order is deleted, all its line items are automatically removed to prevent orphaned data."

---

## DIAGRAM 12 — Normal Form Evidence Table

### What this diagram shows
Proof that the BizAI database design meets the first three normal forms (1NF, 2NF, 3NF).

### Quick definitions
| Normal Form | The Rule |
|---|---|
| 1NF | Every column holds one atomic (single, indivisible) value. No repeating groups or arrays inside a column. |
| 2NF | Every non-key column must depend on the WHOLE primary key — not just part of it. Eliminates partial dependencies. |
| 3NF | No non-key column should depend on another non-key column. Eliminates transitive dependencies. |

### Most important examples to explain
**orders table — 3NF violation avoided:**
We do NOT store the customer's name inside the orders table. Even though every order belongs to a customer, storing the name would create a transitive dependency: order → customer_name → customer_id. Instead we store only customer_id (FK) and join the customers table when we need the name.

**order_items table — 2NF:**
The primary key of order_items is the combination of order_id and product_id. The quantity and unit_price both depend on this full combination — not just on order_id alone or product_id alone. This satisfies 2NF.

**Justified denormalisation:**
total_amount in orders and invoices is a calculated value stored as a column. This is technically a controlled denormalisation. We justify it because: (1) product prices can change after an order is placed, but the invoice must show the original price — so the amount must be frozen at order time; (2) summing order_items on every report query would be slow. The value is always recalculated from order_items on insert and update, so it is never stale.

### What to say out loud
"This table proves our database meets the first three normal forms. For 1NF, every column stores a single value — we separate order line items into their own order_items table instead of storing a list inside the orders table. For 2NF, there are no partial dependencies — in order_items, every field depends on the full combination of order_id and product_id. For 3NF, we have eliminated transitive dependencies — the customer name is not stored in orders; the category name is not stored in products. All related information is referenced through foreign keys. We do have one justified denormalization — total_amount is stored — and we can explain exactly why this engineering decision was made."

---

## DIAGRAM 13 — UML Class Diagram — Data Model Classes

### What this diagram shows
All 11 Python classes that represent database tables (SQLAlchemy ORM models), their exact attributes with data types, their methods, and the object relationships between them.

### Two types of things shown
1. **Attributes** — the data fields, matching directly to database columns
2. **Methods** — Python functions defined inside the class. For example, Product has `is_low_stock()` which returns True if stock_qty is at or below min_stock_level. Invoice has `balance_due()` which returns total_amount minus paid_amount.

### What the relationship notations mean
| Notation | Meaning | Example |
|---|---|---|
| `-->` association | One class references another | User creates Orders |
| `*--` composition | Strong ownership — child is deleted with parent | Order contains OrderItems — delete Order, Items are gone |
| `"1" --> "0..*"` | Cardinality | One User creates zero or more Orders |

### What to say out loud
"This is our UML Class Diagram for the data model layer. Every class here maps directly to a database table. The attributes correspond to columns. Some classes also have computed methods — for example, Invoice has balance_due() which calculates the remaining amount to be paid, and Product has is_low_stock() which checks if current stock is at or below the minimum level. The composition relationship between Order and OrderItem is important — this means an OrderItem cannot exist without its parent Order. If the Order is deleted, its Items are deleted with it through the CASCADE DELETE database constraint."

---

## DIAGRAM 14 — UML Class Diagram — Service Layer

### What this diagram shows
The eight service classes that contain all the business logic, their public and private methods with parameter types and return types, and which model classes each service depends on.

### Key services and their responsibilities
| Service | Core responsibility |
|---|---|
| AuthService | Verifies passwords with bcrypt, creates and decodes JWT tokens |
| CustomerService | Full CRUD for customers with search and pagination |
| ProductService | Full CRUD for products plus the update_stock() method that also logs an inventory_movement |
| OrderService | Creates orders, validates stock exists, runs the atomic confirmation transaction |
| InvoiceService | Creates invoices from confirmed orders, records payments, generates PDF |
| ReportService | Aggregates data for dashboards and reports; also builds the AI snapshot |
| AIService | Classifies intent, calls ReportService for data, optionally calls Groq, logs the query |

### Private vs public methods
- Public methods (marked with +) are called from routers (API endpoints)
- Private methods (marked with -) are internal helpers. For example, AIService._fallback_answer() is only called internally when no Groq API key is available.

### The most important dependency chain
AIService calls ReportService.build_business_snapshot(). ReportService queries Order, OrderItem, Invoice, Product, and Expense. This is why the AI can answer questions about any part of the business — it uses the same data layer as the reports.

### What to say out loud
"This is our Service Layer Class Diagram. The service classes contain all the business logic — they are the brain of the application. The router layer just receives the HTTP request and calls the appropriate service. This separation of concerns is a core principle of good software design. The most interesting dependency chain here is: AIService depends on ReportService, which aggregates data from five different model classes. This is why our AI assistant can answer questions about sales, products, stock, and revenue — it builds a snapshot from all of them before answering. The private methods in AIService — _fallback_answer and _ask_model — are internal helpers that handle the two possible paths: using Groq if configured, or pattern-matching the snapshot data if not."

---

## Quick Q&A — Questions Sir Is Likely to Ask

**Q: Why did you choose FastAPI over Django or Flask?**
A: FastAPI is built specifically for REST APIs. It is faster than both Django and Flask, automatically generates Swagger documentation, and uses Python type hints for request validation with no extra code. Django is designed for server-rendered full-stack apps which is not what we built.

**Q: What is the difference between Level 0 and Level 1 DFD?**
A: Level 0 treats the entire system as one black box and only shows external actors and data flows crossing the system boundary. Level 1 opens that black box and shows the internal processes and data stores. They represent the same system at different levels of detail.

**Q: Your database diagram shows SQLite but the architecture diagram shows PostgreSQL — which do you use?**
A: SQLite is used during development because it needs no server to run. PostgreSQL is the production database. SQLAlchemy ORM abstracts the database engine — we switch between them by changing a single DATABASE_URL environment variable. The code, queries, and models are identical.

**Q: Is your database fully normalised?**
A: Yes, all tables satisfy 1NF, 2NF, and 3NF. We have one deliberate and justified denormalisation — the total_amount column in orders and invoices — which we can explain. It is recalculated on every write, so it is always consistent, and it is necessary for invoice document stability and fast report queries.

**Q: How does the AI know about our business data?**
A: It does not use training data for business facts. When a question is asked, our system runs specific SQL queries on the live database — for example, SELECT SUM(total_amount) FROM orders WHERE status = delivered AND this month. These results are passed as structured JSON to the language model which formats them into a readable sentence. The LLM cannot invent numbers because it only receives data that was just retrieved from the real database.

**Q: How does RBAC work in your system?**
A: Every API endpoint has a required role. When a request arrives, the JWT middleware decodes the token and extracts the user's role. If the role does not match what the endpoint requires, the request is rejected with 403 Forbidden before reaching the service layer. For example, the DELETE /users endpoint requires role = admin. A Manager's token would be rejected at the middleware level.

**Q: What is the difference between composition and association in your class diagram?**
A: Association (arrow) means one class uses or references another, but they can exist independently. Composition (filled diamond arrow) means the child cannot exist without the parent. Order and OrderItem are a composition — an OrderItem has no meaning without its Order. If the Order is deleted, all its Items are deleted too through CASCADE DELETE. User and Order are an association — the User still exists even if all their Orders are deleted.

**Q: How does the atomic transaction in order confirmation prevent data corruption?**
A: When the Manager confirms an order, the system calls BEGIN TRANSACTION. Inside the transaction it deducts stock for each product and logs each inventory movement. Only if all deductions succeed does it update the order status to confirmed and call COMMIT. If any deduction fails — for example a product has insufficient stock — the system calls ROLLBACK, which undoes all changes made inside the transaction. No partial stock deductions are ever saved to the database.

---

*BizAI — Team YATRI | Presentation Guide 2026*
*One section per team member — assign sections before the presentation day.*
