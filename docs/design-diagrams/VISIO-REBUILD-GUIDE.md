# Visio rebuild guide and review outcome

## Verdict

The diagram set has strong coverage (architecture, use cases, DFDs, sequences, ERD and domain model), but it was **not submission-ready as UML** before this review. The corrected Mermaid sources now reflect the implementation. Rebuild from these sources, not from `PROJECT_ARCHITECTURE.md`, which describes planned features that are absent from the repository.

Sommerville's 10th edition presents system models from context, interaction, structure and behaviour perspectives; a single diagram is not expected to express all of them. Use-case and sequence diagrams cover interactions, the ERD/domain model cover structure, and the component/deployment view covers architecture. [Sommerville, *Software Engineering*, 10th ed., Ch. 5-7](https://www.oreilly.com/library/view/software-engineering-10th/9780137586691/xhtml/fileP70004959260000000000000000015E8.xhtml).

## Build these in Visio

| File | Visio stencil / notation | What to draw |
|---|---|---|
| `01-system-architecture.mmd` | UML Component plus Deployment | Nodes for client, FastAPI application and database; components inside them; show the AI assistant as configurable rather than tied to a vendor. |
| `02-use-cases.mmd` | UML Use Case | Stick actors outside one system boundary. Use solid, unlabelled association lines only to individual ellipses. Use dashed arrows labelled `<<include>>` between use cases. |
| `03-dfd-level0.mmd`, `04-dfd-level1.mmd` | DFD (not UML) | Keep processes, external entities, stores and labelled data arrows. Do not mix UML component symbols into these drawings. Ensure Level 1 balances the Level 0 inputs/outputs. |
| `05`–`09` | UML Sequence | Lifelines across the top, time downward, solid call arrows, dashed return arrows, activation bars only while executing, and `alt`/`opt` combined fragments. |
| `10-er-diagram.mmd` | Crow's Foot Database Notation | Tables with PK/FK/UK labels. Put the optional-one mark at `InventoryMovement.created_by` and `Product.category_id`; invoice `order_id` is unique. |
| `11-class-diagram-models.mmd` | UML Class | Three compartments. Use `- password_hash` private. Show the exact multiplicities written in the source. The `Order`–`OrderItem` composition has a filled diamond at Order. |
| `12-class-diagram-services.mmd` | UML Package / Component | Do **not** draw invented `AuthService` or `InvoiceService` classes: these are Python modules with functions. Use package/component dependencies instead. |

## Non-negotiable notation rules

1. Do not connect an actor to a package/group of use cases. Connect it to every permitted use-case ellipse.
2. An `include` is mandatory reused behaviour. The dashed arrow points **from the including use case to the included use case**. A status guard belongs in square brackets beside the relationship.
3. Keep implementation names in design diagrams only where they are genuinely implemented. Current default database is SQLite; PostgreSQL is configuration-dependent. JWT is enforced via dependencies, not an HTTP middleware class, and there is no rate limiter.
4. DFD arrows must name data (`credentials`, `order request`, `invoice response`), rather than controls (`click button`) or screens (`dashboard UI`). No entity-to-store or store-to-store arrows.
5. Every sequence must describe one scenario. The endpoints currently implemented are `POST /api/products/{id}/stock` and `POST /api/invoices/from-order/{order_id}`; do not label them as PUT or `/invoices`.
6. In the ERD, relationship cardinality follows the foreign keys, while the class diagram follows object navigability. Keep both diagrams; do not try to merge them.

## Source-specific checks already applied

- `01-system-architecture.mmd`: added UML component/deployment title comment.
- `02-use-cases.mmd`: replaced `<<include>>` with `«include»` (UML guillemets); removed embedded guard condition from `US → LOG` include arrow and placed it as a comment.
- `03-dfd-level0.mmd`: replace the outgoing **Audit Logs** label with `user-management results`; the application has request logging but no audit-log store/API.
- `04-dfd-level1.mmd`: label the finance process as `4.0 Manage invoices and expenses`; renamed D3 from `Orders DB` to `orders and order_items` for consistency with D1 and D2. The code updates invoice fields through `PATCH /invoices/{id}/status`, rather than a distinct payment transaction endpoint.
- `06-sequence-order-flow.mmd`: identify the actor as **staff user** for creation and add a note that only Admin/Manager may change order status. Added cancellation stock reversal branch: when a confirmed/shipped order is cancelled, stock is restored and inventory movements are recorded.
- `07-sequence-invoice.mmd`, `09-sequence-stock-adjust.mmd`: standardised DB participant label to `SQLAlchemy database` for consistency across all sequence diagrams.
- `10-er-diagram.mmd`: marked `customers.email` as `UK "nullable"` to match the ORM definition.
- `11-class-diagram-models.mmd`: added `+description: Text` to `Product` class; added comment noting audit timestamps are omitted for readability.
- Delete any claim that invoice generation requires a confirmed order: the current code permits any existing order and creates a `sent` invoice, or returns the existing invoice.

## Scope note

The diagram set documents the code **as implemented**. If your intended requirements really include PostgreSQL-only deployment, refresh tokens, rate limiting, an inventory router, payment transactions, or audit logs, implement those first and then revise the diagrams to match.
