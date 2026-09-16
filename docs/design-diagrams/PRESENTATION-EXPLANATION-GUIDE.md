# BizAI — Diagram Explanation Guide for Presentation
### How to explain every diagram to Sir — Team YATRI

> Read this before your presentation. Each section tells you WHAT the diagram shows, WHY it exists, and WHAT TO SAY out loud when presenting it.

---

## Presentation Order (follow this sequence)

1. System Architecture Diagram
2. Use Case Diagram
3. DFD Level 0 (Context Diagram)
4. DFD Level 1 (Detailed)
5. Login Sequence Diagram
6. Order/Stock/Invoice Sequence Diagram
7. AI Query Sequence Diagram
8. ER Diagram (Database Design)
9. Normalization Table
10. UML Class Diagram

---

## 1. System Architecture Diagram

### What this diagram is
A high-level picture of how all parts of the BizAI system are connected. It shows the four layers of the system — the client, the backend, the AI layer, and the database — and how they talk to each other.

### What each element means
| Element | What it represents |
|---|---|
| React + Vite SPA | The website the user opens in their browser. Pages like Dashboard, Customers, Orders etc. |
| Axios HTTP Client | The piece of code in the browser that sends requests to the backend using JSON and a JWT security token |
| FastAPI REST API | The server that receives requests, checks permissions, runs business logic, and returns responses |
| Auth Middleware | Checks the JWT token on every request to verify the user is logged in and has permission |
| Business Logic Services | Code that handles the rules — e.g., stock must be checked before confirming an order |
| SQLAlchemy ORM | The layer that converts Python objects into SQL queries so we never write raw SQL |
| PostgreSQL | The database that stores all records permanently |
| AI Service | Identifies what the user is asking, queries the database, and returns a grounded answer |
| Optional LLM (Groq) | If configured, it formats the database results into natural language |

### What to say out loud
"BizAI follows a layered architecture. The user interacts with a React frontend running in their browser. When they perform an action — like creating an order or asking an AI question — the frontend sends a secure JSON request to our FastAPI backend. The backend first authenticates the request using JWT tokens, then routes it to the correct service. Services apply business logic, then read and write to PostgreSQL through SQLAlchemy. The AI layer is separate — it takes the question, queries the database for exact data, and then optionally uses the Groq LLM to turn that structured data into a readable answer. This design keeps concerns separated and makes the system easy to maintain and scale."

---

## 2. Use Case Diagram

### What this diagram is
A diagram that shows who uses the system and what they can do. The four actors are Admin, Manager, Employee, and Accountant. The ovals represent system features (use cases).

### What each actor can do
| Actor | Their main responsibilities |
|---|---|
| Admin | Full access — users, roles, customers, products, inventory, orders, invoices, reports, AI |
| Manager | Operational control — customers, products, inventory, orders, invoices, reports, AI |
| Employee | Day-to-day work — create orders, manage customers and products, view notifications |
| Accountant | Financial tasks only — invoices, payments, reports, customer records |

### What the dashed arrows mean
- CreateOrder includes StockValidation — every time an order is created, stock is automatically checked. This is a mandatory dependency.
- CreateOrder includes GenerateInvoice — once an order is confirmed, an invoice can be generated.
- AskAI uses ViewReports — the AI assistant internally uses the same data as the reports module.

### What to say out loud
"This is our Use Case Diagram. It shows the four user roles in our system and the features each role can access. The Admin has full system access. The Manager handles daily operations. The Employee focuses on customer-facing work like creating orders. The Accountant only handles financial records. The dashed arrows show dependencies — for example, creating an order always triggers a stock validation check, and once confirmed, it includes invoice generation. This Role-Based Access Control design means every user only sees and touches what they are authorized to do."

---

## 3. DFD Level 0 — Context Diagram

### What this diagram is
A Context Diagram (Level 0 DFD) shows the entire BizAI system as a single circle, with external entities around it and arrows showing what data flows in and out. It answers: what does the system receive and what does it produce?

### What each element means
| Element | Explanation |
|---|---|
| External Entities (users) | Admin, Manager, Employee, Accountant — the people who interact with the system |
| BizAI System (the circle) | The entire application treated as one black box |
| PostgreSQL Database | The persistent data store |
| Groq LLM | An external AI service that receives only structured data and returns language |
| Arrows | Data flows — credentials going in, reports and invoices coming out |

### What to say out loud
"This is our Context Level DFD — the highest level of our Data Flow Diagram. It treats the entire BizAI system as a single process. Users send credentials, business data, and queries into the system. The system returns dashboard reports, invoices, AI answers, and notifications. Internally, it reads and writes records to PostgreSQL. When the AI assistant is used, the system sends only structured data to the external Groq LLM — it never sends raw database dumps, only the specific numbers and records needed to answer the question."

---

## 4. DFD Level 1 — Detailed Data Flow

### What this diagram is
Level 1 DFD breaks the single BizAI process into its six internal sub-processes and shows how data flows between them and the five data stores.

### What each process does
| Process | What it handles |
|---|---|
| 1.0 Authenticate and Authorize | Verifies user identity and role before allowing any action |
| 2.0 Manage Customers and Products | CRUD operations for customers, products, and categories |
| 3.0 Process Order and Stock | Creates orders, validates stock, deducts inventory on confirmation |
| 4.0 Generate Invoice and Payment | Creates invoices from orders, records payments |
| 5.0 Calculate Reports | Aggregates data from customers, orders, and invoices for the dashboard |
| 6.0 Answer AI Question | Identifies intent, queries specific data, formats grounded answer |

### What the data stores are
| Store | What it holds |
|---|---|
| D1 Users and Roles | Login credentials, role assignments |
| D2 Customers and Products | All customer records, product catalog, categories |
| D3 Orders and Stock Movements | All orders, order items, stock change history |
| D4 Invoices and Expenses | Invoice records, payment status, expense entries |
| D5 Notifications and AI History | System alerts, AI query logs |

### What to say out loud
"This is our Level 1 DFD. It expands the system into six core processes. A request enters at Process 1 — authentication — and flows logically through customer management, order processing, invoice generation, and reporting. The AI query process is separate and can directly access any data store to answer questions. Each data store holds a specific category of business records, which keeps the design clean and normalized. This diagram proves that our system has a structured data flow with no orphaned or disconnected processes."

---

## 5. Sequence Diagram — Login and Authentication

### What this diagram is
A sequence diagram shows time-ordered messages between different parts of the system. This one traces exactly what happens from the moment a user types their email and password to the moment they see the dashboard.

### Step-by-step explanation
1. User types email and password in the React login form
2. The frontend sends a POST request to /auth/login
3. The backend looks up the user record in PostgreSQL by email
4. The database returns the stored hashed password and role
5. The backend uses bcrypt to verify the entered password against the hash
6. If correct, it creates a JWT access token with a 15-minute expiry
7. The token is returned to the frontend
8. The frontend immediately calls /auth/me with the token in the Authorization header
9. The backend loads the full user profile and permissions
10. The frontend stores the user object and redirects to the Dashboard

### Why JWT and not sessions?
JWT is stateless — the server does not need to store session data. This makes the system scalable and works better with REST APIs.

### What to say out loud
"This is our Login Sequence Diagram. It shows the exact message flow between the user, the React frontend, the FastAPI backend, the security service, and PostgreSQL. Passwords are never stored in plain text — we use bcrypt hashing. After successful verification, we issue a JWT token which the frontend sends with every subsequent request. This is the standard authentication pattern for modern REST APIs and it is what industry applications use."

---

## 6. Sequence Diagram — Order Creation, Stock Update, Invoice

### What this diagram is
This sequence diagram traces the most important business workflow in BizAI — creating an order, confirming it which deducts stock atomically, and generating an invoice.

### Step-by-step explanation

Phase 1 — Create Draft Order:
1. Manager selects a customer and adds products
2. Frontend sends a POST to /orders
3. Order Service reads current stock levels from DB
4. Saves the order as pending status with all line items
5. Returns the draft order to the frontend

Phase 2 — Confirm Order (Critical step):
1. Manager clicks Confirm Order
2. Frontend sends PATCH to /orders/id/status
3. Order Service starts an atomic database transaction
4. Within that transaction: reduces stock_qty for each product, inserts a stock_movement record, updates order status to confirmed
5. The transaction is committed — either all steps succeed or none do (atomicity)

Phase 3 — Generate Invoice:
1. Manager clicks Generate Invoice
2. Frontend sends POST to /invoices/from-order/id
3. Invoice Service creates a new invoice linked to the order
4. Returns the invoice which can be previewed or downloaded as PDF

### Why atomic transactions matter
If the server crashes after deducting stock but before saving the order status, the transaction rolls back automatically. This prevents data corruption.

### What to say out loud
"This is our Order Flow Sequence Diagram — the core business workflow of BizAI. It has three phases: creating a draft order, confirming it with atomic stock deduction, and generating an invoice. The critical part is Phase 2 — we use a database transaction to ensure that stock is only deducted when the order is officially confirmed. If anything fails mid-way, the transaction rolls back and no data is corrupted. This is how professional ERP and e-commerce systems handle inventory management."

---

## 7. Sequence Diagram — AI Business Query

### What this diagram is
This diagram shows how our AI assistant answers business questions. Unlike general-purpose chatbots, BizAI's AI is grounded — it always queries the real database before answering, so it cannot invent numbers.

### Step-by-step explanation
1. Admin types a question like "What were total sales this month?"
2. Frontend sends the question with the JWT token to /ai/chat
3. The Intent Handler classifies the question — identifies it as "sales_summary" intent
4. It queries PostgreSQL for the exact sum of delivered orders in the current month
5. The database returns actual numbers — for example total: 125000, count: 42
6. These numbers are sent as structured context to the optional Groq LLM
7. Groq formats a readable answer
8. The answer and source data are returned to the frontend
9. The query is logged in the ai_queries table for history
10. The frontend shows the answer with a disclaimer that it is based on live data

### Why this is better than a regular chatbot
A regular chatbot might guess or make up numbers based on training data. Our system returns exact figures from the actual database records.

### What to say out loud
"This is our AI Query Sequence Diagram. What makes our AI assistant different from a generic chatbot is that it is data-grounded. When you ask a business question, the system first classifies your intent, then queries the actual database for exact figures, and only then uses a language model to format the answer. The LLM never has direct access to the database — it only receives the structured result. This prevents hallucination, which is when AI makes up numbers. Every answer is traceable to actual records in our database."

---

## 8. Database ER Diagram (Entity-Relationship)

### What this diagram is
The ER Diagram shows all the tables in the database and the relationships between them. It is the blueprint of how data is stored and connected.

### What each table stores
| Table | What it stores |
|---|---|
| ROLES | Role definitions: Admin, Manager, Employee, Accountant |
| USERS | All system users — email, hashed password, role assignment |
| CUSTOMERS | Customer records — name, email, phone, company, outstanding balance |
| CATEGORIES | Product category groupings |
| PRODUCTS | All products — SKU, price, cost price, current stock, minimum stock level |
| ORDERS | Order records — customer, status, total amount, who created it |
| ORDER_ITEMS | Individual line items in each order — product, quantity, unit price |
| INVOICES | Invoice linked to an order — payment status, due date, paid amount |
| EXPENSES | Business expenses recorded by the accountant or admin |
| STOCK_MOVEMENTS | Every stock change with type (sale, return, manual adjustment) and reason |
| AI_QUERIES | History of every AI question asked and its answer |

### What the relationship symbols mean
- One-to-Many (||--o{): one Customer places many Orders
- One-to-Many mandatory (||--|{): one Order must contain at least one OrderItem
- One-to-One (||--o|): one Order generates at most one Invoice

### What to say out loud
"This is our Entity-Relationship Diagram. It shows all eleven tables in our database and how they are connected. The design follows a classic relational model — users belong to roles, customers place orders, orders contain order items linked to products, and confirmed orders generate invoices. We also have separate tables for expenses, stock movements, and AI query history. The relationships ensure data integrity — you cannot create an order without a valid customer, and you cannot create an invoice without a confirmed order."

---

## 9. Normalization Evidence Table

### What this is
This table is shown alongside the ER Diagram to prove that our database design follows the rules of database normalization — specifically the first three normal forms.

### What each normal form means
| Normal Form | Rule | How we satisfy it |
|---|---|---|
| 1NF | Every column stores one atomic value. No arrays or repeating groups. | Each column in every table holds exactly one piece of data. Order items are in a separate table, not as a list inside orders. |
| 2NF | Every non-key column must depend on the entire primary key. | In order_items, quantity and unit_price depend on the full combination of order_id and product_id. No partial dependencies exist. |
| 3NF | No non-key column should depend on another non-key column. | Customer name is not stored in the orders table. It is accessed via the customer_id foreign key, eliminating transitive dependencies. |

### What to say out loud
"This normalization table proves that our database design meets the first three normal forms. For 1NF, every table has atomic values with no repeating groups — order items are in their own table, not stored as a list inside the orders table. For 2NF, every column depends on the full primary key. For 3NF, we have eliminated transitive dependencies — customer details are stored once in the customers table and referenced by ID everywhere else. This prevents data redundancy and ensures consistency across the entire database."

---

## 10. UML Class Diagram

### What this diagram is
The UML Class Diagram shows the code structure — the Python classes that make up the application, their attributes (data fields), their methods (functions), and how they relate to each other.

### Two types of classes shown

Data model classes (from the models folder in the backend):
These map directly to database tables — User, Role, Customer, Product, Category, Order, OrderItem, Invoice, Expense, StockMovement, AIQuery

Service classes (from the services folder in the backend):
These contain the business logic — AuthService, OrderService, InvoiceService, ReportService, AIService

### What the relationship arrows mean
| Arrow | Meaning | Example |
|---|---|---|
| Association one-to-many | One class creates or references many of another | One User creates many Orders |
| Composition | Strong ownership — child cannot exist without parent | One Order contains OrderItems — delete the order, items are deleted too |
| Dependency | Service class depends on model class | OrderService depends on and manages Order objects |

### What to say out loud
"This is our UML Class Diagram. It shows the object-oriented design of our application. We have two groups of classes — data model classes that represent database entities, and service classes that contain business logic. The model classes have attributes matching their database columns. The service classes have methods — for example, OrderService has create_order, confirm_order, and deduct_stock methods. The relationships between classes reflect the database relationships — an Order contains OrderItems using composition. This diagram proves our code follows object-oriented design principles with clear separation of concerns between data, logic, and presentation."

---

## Common Questions Sir Might Ask — and How to Answer Them

**Q: Why did you use FastAPI instead of Django?**
A: FastAPI is significantly faster, has automatic API documentation through Swagger UI, uses Python type hints for validation, and is designed specifically for REST APIs. Django is better for full-stack web applications with server-rendered HTML, which is not what we built.

**Q: Why SQLite in development but PostgreSQL in diagrams?**
A: We use SQLite locally during development because it requires zero setup. The architecture is designed for PostgreSQL in production, which we switch to simply by changing the DATABASE_URL environment variable. SQLAlchemy handles both databases identically.

**Q: What is the difference between the DFD Level 0 and Level 1?**
A: Level 0 shows the system as a single black box — what data goes in and what comes out. Level 1 breaks that black box into its internal processes and shows how data flows between them. They are two levels of the same diagram with increasing detail.

**Q: How does Role-Based Access Control work in your system?**
A: Every API endpoint has a required role annotation. The JWT token contains the user's role. When a request arrives, the Auth Middleware decodes the JWT, extracts the role, and checks it against the endpoint's required role. If it does not match, the request is rejected with a 403 Forbidden error before reaching the service layer.

**Q: Why is total_amount stored in the orders table if it can be calculated from order_items?**
A: This is a deliberate denormalization for two reasons — invoice document stability (if a product price changes later, the invoice amount must not change) and fast reporting queries (aggregating from line items on every dashboard call would be slow). The value is always recalculated fresh when the order is created or updated.

**Q: Is your database in 3NF?**
A: Yes. Every table has a single primary key, all attributes are atomic satisfying 1NF, all non-key attributes depend only on the primary key satisfying 2NF, and there are no transitive dependencies — all related data is referenced by foreign key rather than duplicated, satisfying 3NF.

**Q: How is your AI assistant different from ChatGPT?**
A: ChatGPT is a general-purpose language model that can only know your business data if you paste it in. Our AI assistant is grounded — it queries your actual database in real time before generating an answer. It cannot hallucinate because it only describes facts from the live database.

---

*Prepared for BizAI Design Diagram Presentation — Team YATRI 2026*
