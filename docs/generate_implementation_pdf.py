"""
Generate publication-quality Implementation Document PDF for BizAI using ReportLab.
Conforms to Ian Sommerville Software Engineering (10th Ed.) & UML 2.5.
"""
import os
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_decorations(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_decorations(self, page_count):
        if self._pageNumber > 1:
            self.saveState()
            self.setFont('Helvetica', 8)
            self.setFillColor(colors.HexColor('#4A5568')) # Slate gray
            
            # Running Header
            self.setStrokeColor(colors.HexColor('#CBD5E0'))
            self.setLineWidth(0.6)
            self.line(54, 745, letter[0] - 54, 745)
            self.drawString(54, 752, 'BizAI — System Implementation & Technical Architecture Manual')
            self.drawRightString(letter[0] - 54, 752, 'Ian Sommerville SE10 & UML 2.5')
            
            # Running Footer
            self.line(54, 45, letter[0] - 54, 45)
            self.drawString(54, 32, 'Official Engineering Report — Team YATRI (Capstone Project)')
            self.drawRightString(letter[0] - 54, 32, f'Page {self._pageNumber} of {page_count}')
            self.restoreState()

def create_implementation_pdf(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom styles
    primary_color = colors.HexColor('#1A365D') # Deep Navy
    secondary_color = colors.HexColor('#2B6CB0') # Accent Blue
    text_dark = colors.HexColor('#2D3748')
    bg_alt = colors.HexColor('#F7FAFC')
    border_color = colors.HexColor('#E2E8F0')

    style_title = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=primary_color,
        alignment=1, # Center
        spaceAfter=10
    )

    style_subtitle = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#4A5568'),
        alignment=1,
        spaceAfter=25
    )

    style_h1 = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=primary_color,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    style_h2 = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=secondary_color,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    style_body = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=text_dark,
        spaceAfter=5
    )

    style_code = ParagraphStyle(
        'Code_Custom',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#1A202C'),
        spaceAfter=4
    )

    style_th = ParagraphStyle(
        'TH_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    style_td = ParagraphStyle(
        'TD_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=text_dark
    )

    style_td_code = ParagraphStyle(
        'TD_Code',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7,
        leading=8.5,
        textColor=colors.HexColor('#2C5282')
    )

    story = []

    # ==========================================
    # COVER PAGE
    # ==========================================
    story.append(Spacer(1, 40))
    p_tag = Paragraph("SOFTWARE ENGINEERING CAPSTONE DOCUMENTATION", ParagraphStyle('CoverTag', fontName='Helvetica-Bold', fontSize=10, leading=12, textColor=secondary_color, alignment=1))
    story.append(p_tag)
    story.append(Spacer(1, 10))

    story.append(Paragraph("BizAI Enterprise Platform", style_title))
    story.append(Paragraph("System Implementation & Technical Architecture Manual", ParagraphStyle('MainSub', fontName='Helvetica-Bold', fontSize=14, leading=18, textColor=secondary_color, alignment=1)))
    story.append(Spacer(1, 6))
    story.append(Paragraph("A Comprehensive Engineering Guide to Layered Architecture, Atomic Stock Reservations, Idempotent Billing, and Context-Grounded AI Inference", style_subtitle))
    
    story.append(HRFlowable(width="80%", thickness=1.5, color=secondary_color, spaceBefore=5, spaceAfter=25))

    # Cover Metadata Table
    cover_meta = [
        [Paragraph("Standard Compliance:", style_td), Paragraph("<b>Ian Sommerville, Software Engineering (10th Ed.) & UML 2.5 (ISO/IEC 19505)</b>", style_td)],
        [Paragraph("Project Architecture:", style_td), Paragraph("<b>Strict 4-Layer (React 19 SPA &bull; FastAPI ASGI &bull; SQLAlchemy ORM &bull; SQLite/PostgreSQL)</b>", style_td)],
        [Paragraph("Engineering Team:", style_td), Paragraph("<b>Team YATRI</b>: Mohammad Ibad Hussain (Lead), Yash Narang, Ashutosh Yadav, Tushar, Ramji", style_td)],
        [Paragraph("Target Codebase:", style_td), Paragraph("<b>backend/</b> (FastAPI, SQLAlchemy, PyJWT, ReportLab) + <b>frontend/</b> (React 19, Vite)", style_td)],
        [Paragraph("Inference Stack:", style_td), Paragraph("<b>Meta LLaMA 3.1 8B</b> on Groq Cloud LPUs with deterministic JSON snapshot grounding", style_td)],
        [Paragraph("Document Status:", style_td), Paragraph("<b>Baselined Implementation Report (Version 1.0) &bull; Academic Term 2026</b>", style_td)],
    ]
    t_cover = Table(cover_meta, colWidths=[1.8*inch, 4.7*inch])
    t_cover.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E0')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_cover)
    story.append(Spacer(1, 30))

    # Executive Abstract Callout Box
    abstract_text = (
        "<b>Executive Implementation Summary:</b> BizAI is an enterprise-grade ERP platform addressing operational "
        "fragmentation in small-to-medium retail and wholesale enterprises. It integrates Customer Relationship Management, "
        "Dynamic Catalog Inventory, Two-Phase Sales Order Orchestration, Vector PDF Invoicing, Operating Expense Auditing, "
        "and Context-Grounded AI Analytics. This document details the technical implementation, software patterns, "
        "concurrency safety mechanisms, database models, and REST contracts realized in the production repository."
    )
    t_abs = Table([[Paragraph(abstract_text, style_body)]], colWidths=[6.5*inch])
    t_abs.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#EBF8FF')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#3182CE')),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    story.append(t_abs)
    story.append(PageBreak())

    # ==========================================
    # SECTION 1: ARCHITECTURAL PATTERN & SYSTEM STACK
    # ==========================================
    story.append(Paragraph("1. System Architecture & Technology Stack", style_h1))
    story.append(Paragraph(
        "In accordance with <b>Ian Sommerville's Software Engineering (10th Ed., Chapter 6, §6.3.1)</b>, BizAI implements a "
        "<b>Strict Layered Architectural Style</b>. System functionality is organized into discrete horizontal layers, "
        "where each layer communicates exclusively with the layer directly beneath it through standardized interfaces.",
        style_body
    ))

    arch_layers = [
        [Paragraph("Layer", style_th), Paragraph("Core Technology", style_th), Paragraph("Implementation Responsibility in BizAI", style_th)],
        [Paragraph("<b>Presentation Tier</b>", style_td), Paragraph("React 19 SPA &bull; Vite &bull; Tailwind &bull; Chart.js 4", style_td), Paragraph("Zero-reload Single-Page Application; Axios HTTP client with JWT interceptors; responsive component views.", style_td)],
        [Paragraph("<b>API & Security Tier</b>", style_td), Paragraph("FastAPI &bull; Starlette ASGI &bull; Pydantic v2", style_td), Paragraph("11 APIRouters; OAuth2 Password Bearer; compile-time request validation; RoleChecker RBAC callables.", style_td)],
        [Paragraph("<b>Domain Services</b>", style_td), Paragraph("Python 3.10+ Business Modules", style_td), Paragraph("Pure business logic: two-phase order reservation, invoice generation, profitability formulas, snapshot builder.", style_td)],
        [Paragraph("<b>Persistence Tier</b>", style_td), Paragraph("SQLAlchemy 2.0 ORM &bull; SQLite / PostgreSQL", style_td), Paragraph("Dialect-agnostic relational mapping; ACID transaction boundaries; connection pooling; relationship cascades.", style_td)],
        [Paragraph("<b>External AI Tier</b>", style_td), Paragraph("Groq LPU API &bull; Meta LLaMA 3.1 8B", style_td), Paragraph("Sub-second inference grounded with deterministic in-memory business snapshot; local fallback strategy.", style_td)],
    ]
    t_arch = Table(arch_layers, colWidths=[1.3*inch, 1.8*inch, 3.4*inch])
    t_arch.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('BOX', (0,0), (-1,-1), 0.8, border_color),
        ('INNERGRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, bg_alt]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_arch)
    story.append(Spacer(1, 6))

    story.append(Paragraph("Key Architectural Decision: SQLite WAL vs. PostgreSQL", style_h2))
    story.append(Paragraph(
        "<b>The Evaluation & Portability Strategy:</b> The repository defaults to SQLite running with Write-Ahead Logging "
        "(<code>PRAGMA journal_mode=WAL;</code>). This guarantees zero-friction local execution for college evaluators without "
        "requiring external database daemons. However, because all queries use SQLAlchemy 2.0 ORM Declarative Base "
        "(<code>backend/database.py</code>), switching to production PostgreSQL requires altering only the single environment variable "
        "<code>DATABASE_URL=postgresql://user:pass@host:5432/bizai</code>, achieving 100% database engine portability.",
        style_body
    ))

    # ==========================================
    # SECTION 2: DATABASE SCHEMA & RELATIONAL IMPLEMENTATION
    # ==========================================
    story.append(Paragraph("2. Database Schema & Data Models Implementation", style_h1))
    story.append(Paragraph(
        "The relational schema comprises 10 normalized tables enforcing foreign key integrity, unique constraints, and cascade behaviors:",
        style_body
    ))

    db_tables = [
        [Paragraph("Table Name", style_th), Paragraph("Primary Key", style_th), Paragraph("Foreign Keys & Constraints", style_th), Paragraph("Business Purpose", style_th)],
        [Paragraph("<code>roles</code>", style_td_code), Paragraph("<code>id (Int)</code>", style_td_code), Paragraph("<code>name (UK)</code>", style_td_code), Paragraph("Pre-seeded roles: admin, manager, employee, accountant.", style_td)],
        [Paragraph("<code>users</code>", style_td_code), Paragraph("<code>id (Int)</code>", style_td_code), Paragraph("<code>role_id &rarr; roles.id</code>, <code>email (UK)</code>", style_td_code), Paragraph("Staff accounts with bcrypt-hashed credentials and active flags.", style_td)],
        [Paragraph("<code>customers</code>", style_td_code), Paragraph("<code>id (Int)</code>", style_td_code), Paragraph("<code>email (UK, nullable)</code>", style_td_code), Paragraph("Commercial customer directory, GSTIN, and credit ledger.", style_td)],
        [Paragraph("<code>categories</code>", style_td_code), Paragraph("<code>id (Int)</code>", style_td_code), Paragraph("<code>name (UK)</code>", style_td_code), Paragraph("Organizational classification for product catalog items.", style_td)],
        [Paragraph("<code>products</code>", style_td_code), Paragraph("<code>id (Int)</code>", style_td_code), Paragraph("<code>category_id &rarr; categories.id</code>, <code>sku (UK)</code>", style_td_code), Paragraph("Catalog items, cost price, retail price, stock, and low-stock threshold.", style_td)],
        [Paragraph("<code>orders</code>", style_td_code), Paragraph("<code>id (Int)</code>", style_td_code), Paragraph("<code>customer_id &rarr; customers.id</code>, <code>created_by</code>", style_td_code), Paragraph("Sales order records with status state machine and order totals.", style_td)],
        [Paragraph("<code>order_items</code>", style_td_code), Paragraph("<code>id (Int)</code>", style_td_code), Paragraph("<code>order_id &rarr; orders.id (Cascade)</code>, <code>product_id</code>", style_td_code), Paragraph("Line items with purchased quantity, historical unit price, and subtotal.", style_td)],
        [Paragraph("<code>invoices</code>", style_td_code), Paragraph("<code>id (Int)</code>", style_td_code), Paragraph("<code>order_id &rarr; orders.id (UK)</code>, <code>invoice_number (UK)</code>", style_td_code), Paragraph("Billing records, balance due, payment status, and due dates.", style_td)],
        [Paragraph("<code>expenses</code>", style_td_code), Paragraph("<code>id (Int)</code>", style_td_code), Paragraph("<code>created_by &rarr; users.id</code>", style_td_code), Paragraph("Operational expenditures categorized for net profit auditing.", style_td)],
        [Paragraph("<code>inventory_movements</code>", style_td_code), Paragraph("<code>id (Int)</code>", style_td_code), Paragraph("<code>product_id &rarr; products.id</code>, <code>created_by</code>", style_td_code), Paragraph("Immutable audit log tracking all quantity additions and deductions.", style_td)],
    ]
    t_db = Table(db_tables, colWidths=[1.3*inch, 0.9*inch, 2.3*inch, 2.0*inch])
    t_db.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('BOX', (0,0), (-1,-1), 0.8, border_color),
        ('INNERGRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, bg_alt]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_db)
    story.append(PageBreak())

    # ==========================================
    # SECTION 3: BACKEND SUBSYSTEMS & BUSINESS LOGIC
    # ==========================================
    story.append(Paragraph("3. Backend Subsystems & Business Logic Realization", style_h1))
    
    story.append(Paragraph("3.1 Authentication & Role-Based Access Control (RBAC)", style_h2))
    story.append(Paragraph(
        "Authentication is stateless, utilizing <b>OAuth2 Password Bearer flow</b> and <b>PyJWT</b> (<code>backend/routers/auth.py</code>). "
        "User passwords undergo 12-round salted hashing using <code>passlib[bcrypt]</code>. Role-Based Access Control is enforced "
        "strictly at the API dependency layer via the <code>RoleChecker</code> callable class in <code>backend/utils/permissions.py</code>:",
        style_body
    ))

    code_rbac = (
        "# backend/utils/permissions.py - Server-Side Role Enforcement Guard\n"
        "class RoleChecker:\n"
        "    def __init__(self, allowed_roles: list[str]):\n"
        "        self.allowed_roles = allowed_roles\n\n"
        "    def __call__(self, user: User = Depends(get_current_active_user)):\n"
        "        if user.role.name not in self.allowed_roles:\n"
        "            raise HTTPException(status_code=403, detail='Operation not permitted')\n"
        "        return user\n\n"
        "require_manager = RoleChecker(['admin', 'manager'])\n"
        "require_accountant = RoleChecker(['admin', 'manager', 'accountant'])"
    )
    t_c1 = Table([[Paragraph(f"<pre>{code_rbac}</pre>", style_code)]], colWidths=[6.5*inch])
    t_c1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F7FAFC')),
        ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor('#CBD5E0')),
        ('PADDING', (0,0), (-1,-1), 6)
    ]))
    story.append(t_c1)
    story.append(Spacer(1, 6))

    story.append(Paragraph("3.2 Dynamic Stock Reservation & Order State Machine", style_h2))
    story.append(Paragraph(
        "In <code>backend/services/order_service.py</code>, orders implement a formal two-phase state machine that guarantees "
        "inventory integrity under concurrent access. Stock is <b>not</b> reserved when an order is created as a draft (<code>pending</code>). "
        "Upon confirmation, stock availability is verified across all items; if any item is insufficient, a <code>ValueError</code> triggers "
        "an atomic database <code>ROLLBACK</code>. If confirmed orders are later cancelled, deducted stock is automatically restored:",
        style_body
    ))

    code_order = (
        "# backend/services/order_service.py - Atomic Stock Reservation and Rollback\n"
        "if new_status == 'confirmed' and current_status == 'pending':\n"
        "    for item in order.items:\n"
        "        # update_stock raises ValueError if current stock < requested quantity\n"
        "        product_service.update_stock(db, item.product_id, -item.quantity, commit=False)\n"
        "        # Stage immutable inventory movement log\n"
        "        movement = InventoryMovement(product_id=item.product_id, quantity_change=-item.quantity,\n"
        "                                     reason='Order Confirmation', created_by=current_user.id)\n"
        "        db.add(movement)\n"
        "    order.status = 'confirmed'\n"
        "    db.commit()  # Commits order update, stock decrement, and movement logs atomically"
    )
    t_c2 = Table([[Paragraph(f"<pre>{code_order}</pre>", style_code)]], colWidths=[6.5*inch])
    t_c2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F7FAFC')),
        ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor('#CBD5E0')),
        ('PADDING', (0,0), (-1,-1), 6)
    ]))
    story.append(t_c2)
    story.append(Spacer(1, 6))

    story.append(Paragraph("3.3 Programmatic Vector PDF Invoicing Engine", style_h2))
    story.append(Paragraph(
        "Invoice creation is idempotent: calling <code>POST /api/invoices/from-order/{id}</code> creates a new invoice with status "
        "<code>sent</code> and a 15-day due date, or returns the existing invoice if already generated. Server-side PDF generation "
        "is executed programmatically via ReportLab (<code>backend/utils/pdf.py</code>), generating vector-quality PDF buffers in RAM "
        "and returning them as streaming HTTP responses (<code>media_type='application/pdf'</code>).",
        style_body
    ))

    story.append(Paragraph("3.4 Operating Expense Auditing & Real-Time Profitability Formula", style_h2))
    story.append(Paragraph(
        "Financial intelligence is computed dynamically in <code>backend/services/report_service.py</code> without maintaining stale cache columns: "
        "<br/>&bull; <b>Gross Sales Revenue:</b> <code>sum(Order.total_amount) WHERE status != 'cancelled'</code>"
        "<br/>&bull; <b>Cost of Goods Sold (COGS):</b> <code>sum(OrderItem.quantity * Product.cost_price) WHERE Order.status != 'cancelled'</code>"
        "<br/>&bull; <b>Operating Overheads:</b> <code>sum(Expense.amount)</code>"
        "<br/>&bull; <b>Net Profit:</b> <b>Total Sales Revenue &minus; COGS &minus; Operating Overheads</b>",
        style_body
    ))
    story.append(PageBreak())

    # ==========================================
    # SECTION 4: CONTEXT-GROUNDED AI ARCHITECTURE
    # ==========================================
    story.append(Paragraph("4. Context-Grounded AI Assistant Architecture", style_h1))
    story.append(Paragraph(
        "BizAI eliminates LLM hallucinations through a <b>Deterministic Context-Grounded Architecture</b> (Sommerville SE10, §7.3). "
        "The AI assistant never generates or executes arbitrary SQL queries, preventing SQL injection vulnerabilities. Instead, "
        "it implements the Strategy Pattern across three distinct phases:",
        style_body
    ))

    ai_steps = [
        [Paragraph("Phase", style_th), Paragraph("Subsystem Execution", style_th), Paragraph("Technical Integrity Safeguard", style_th)],
        [Paragraph("<b>1. Snapshot Assembly</b>", style_td), Paragraph("<code>report_service.build_business_snapshot(db)</code>", style_td), Paragraph("Executes deterministic SQLAlchemy aggregations extracting revenue, net profit, low-stock items, top products, and unpaid invoices into a clean JSON dictionary.", style_td)],
        [Paragraph("<b>2. Prompt Grounding</b>", style_td), Paragraph("Injected into Meta LLaMA 3.1 8B via Groq LPU SDK", style_td), Paragraph("System prompt strictly mandates: <i>'Answer ONLY using the provided JSON snapshot. Never invent or hallucinate metrics.'</i> Inference completes in <1.2 seconds.", style_td)],
        [Paragraph("<b>3. Fallback Degradation</b>", style_td), Paragraph("<code>_fallback_answer()</code> Deterministic Engine", style_td), Paragraph("If the Groq API key is missing or network connectivity fails, internal keyword analysis answers queries directly from the snapshot without crashing.", style_td)],
    ]
    t_ai = Table(ai_steps, colWidths=[1.4*inch, 2.2*inch, 2.9*inch])
    t_ai.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('BOX', (0,0), (-1,-1), 0.8, border_color),
        ('INNERGRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, bg_alt]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_ai)
    story.append(Spacer(1, 8))

    # ==========================================
    # SECTION 5: FRONTEND SPA ARCHITECTURE
    # ==========================================
    story.append(Paragraph("5. Frontend Single-Page Application (SPA) Architecture", style_h1))
    story.append(Paragraph(
        "The user interface is built on <b>React 19</b> and bundled using <b>Vite</b>. The client maintains zero full-page "
        "reloads, achieving desktop-like performance via the following architectural components:",
        style_body
    ))

    fe_cards = [
        [Paragraph("Module / Layer", style_th), Paragraph("File Path in Codebase", style_th), Paragraph("Architectural Realization", style_th)],
        [Paragraph("<b>Router Controller</b>", style_td), Paragraph("<code>frontend/src/App.jsx</code>", style_td), Paragraph("Defines 13 protected and public routes using React Router 7. Enforces layout wrappers.", style_td)],
        [Paragraph("<b>Auth Context Store</b>", style_td), Paragraph("<code>frontend/src/context/AuthContext.jsx</code>", style_td), Paragraph("Maintains active user token in localStorage; decodes claims and broadcasts auth state to components.", style_td)],
        [Paragraph("<b>Axios HTTP Client</b>", style_td), Paragraph("<code>frontend/src/api/client.js</code>", style_td), Paragraph("Configured with request interceptors injecting <code>Bearer &lt;token&gt;</code>; response interceptors redirect 401s to /login.", style_td)],
        [Paragraph("<b>Interactive Charts</b>", style_td), Paragraph("<code>frontend/src/pages/Reports.jsx</code>", style_td), Paragraph("Chart.js 4 canvas instances rendering 30-day sales series, margin distributions, and product breakdowns.", style_td)],
        [Paragraph("<b>Component Library</b>", style_td), Paragraph("<code>frontend/src/components/</code>", style_td), Paragraph("Reusable DataTable with live search filters, StatusBadge, Modal dialogs, and confirm prompts.", style_td)],
    ]
    t_fe = Table(fe_cards, colWidths=[1.4*inch, 2.2*inch, 2.9*inch])
    t_fe.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('BOX', (0,0), (-1,-1), 0.8, border_color),
        ('INNERGRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, bg_alt]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_fe)
    story.append(PageBreak())

    # ==========================================
    # SECTION 6: COMPLETE REST API SPECIFICATION
    # ==========================================
    story.append(Paragraph("6. Complete REST API Specification & Security Contracts", style_h1))
    story.append(Paragraph(
        "BizAI exposes 24 high-throughput REST endpoints. All routes require valid Bearer JWTs except <code>/api/auth/login</code>:",
        style_body
    ))

    api_specs = [
        [Paragraph("HTTP", style_th), Paragraph("Route Path", style_th), Paragraph("RBAC Permission", style_th), Paragraph("Status", style_th), Paragraph("Functional Responsibility", style_th)],
        [Paragraph("<code>POST</code>", style_td_code), Paragraph("<code>/api/auth/login</code>", style_td_code), Paragraph("Public", style_td), Paragraph("200", style_td), Paragraph("Authenticates credentials; returns 30-min HMAC-SHA256 JWT.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/auth/me</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Returns current authenticated user profile and permissions.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/users</code>", style_td_code), Paragraph("<code>require_admin</code>", style_td_code), Paragraph("200", style_td), Paragraph("Lists all provisioned staff accounts.", style_td)],
        [Paragraph("<code>POST</code>", style_td_code), Paragraph("<code>/api/users</code>", style_td_code), Paragraph("<code>require_admin</code>", style_td_code), Paragraph("201", style_td), Paragraph("Provisions new user with bcrypt-hashed credentials.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/customers</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Paginated, searchable commercial customer directory.", style_td)],
        [Paragraph("<code>POST</code>", style_td_code), Paragraph("<code>/api/customers</code>", style_td_code), Paragraph("<code>require_employee</code>", style_td_code), Paragraph("201", style_td), Paragraph("Registers customer profile with contact & GSTIN numbers.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/products</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Product master catalog with real-time stock levels.", style_td)],
        [Paragraph("<code>POST</code>", style_td_code), Paragraph("<code>/api/products</code>", style_td_code), Paragraph("<code>require_manager</code>", style_td_code), Paragraph("201", style_td), Paragraph("Creates catalog item with cost price and low-stock alert threshold.", style_td)],
        [Paragraph("<code>POST</code>", style_td_code), Paragraph("<code>/api/products/{id}/stock</code>", style_td_code), Paragraph("<code>require_manager</code>", style_td_code), Paragraph("200", style_td), Paragraph("Manual stock adjustment override; writes immutable movement row.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/products/low-stock</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Filters products where stock_qty &le; min_stock_level.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/products/history</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Complete inventory movement audit log with timestamps & users.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/orders</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Lists sales orders with embedded customer summary and line items.", style_td)],
        [Paragraph("<code>POST</code>", style_td_code), Paragraph("<code>/api/orders</code>", style_td_code), Paragraph("<code>require_employee</code>", style_td_code), Paragraph("201", style_td), Paragraph("Composes draft sales order in 'pending' status.", style_td)],
        [Paragraph("<code>PATCH</code>", style_td_code), Paragraph("<code>/api/orders/{id}/status</code>", style_td_code), Paragraph("<code>require_manager</code>", style_td_code), Paragraph("200", style_td), Paragraph("State transition; triggers atomic stock deduction on confirmation.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/invoices</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Queries enterprise invoices, balance due, and payment states.", style_td)],
        [Paragraph("<code>POST</code>", style_td_code), Paragraph("<code>/api/invoices/from-order/{id}</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("201", style_td), Paragraph("Idempotent invoice generator; sets 15-day due date.", style_td)],
        [Paragraph("<code>PATCH</code>", style_td_code), Paragraph("<code>/api/invoices/{id}/status</code>", style_td_code), Paragraph("<code>require_accountant</code>", style_td_code), Paragraph("200", style_td), Paragraph("Records partial/full payment, updates balance due, settles invoice.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/invoices/{id}/pdf</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Server-side vector PDF invoice compilation via ReportLab.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/expenses</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Queries categorized operational expense records.", style_td)],
        [Paragraph("<code>POST</code>", style_td_code), Paragraph("<code>/api/expenses</code>", style_td_code), Paragraph("<code>require_accountant</code>", style_td_code), Paragraph("201", style_td), Paragraph("Logs operational expenditure with receipt description.", style_td)],
        [Paragraph("<code>GET</code>", style_td_code), Paragraph("<code>/api/reports/dashboard</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Executive metrics: Total Revenue, COGS, Net Profit, Low Stock.", style_td)],
        [Paragraph("<code>POST</code>", style_td_code), Paragraph("<code>/api/ai/chat</code>", style_td_code), Paragraph("<code>require_staff</code>", style_td_code), Paragraph("200", style_td), Paragraph("Constructs live JSON snapshot; queries LLaMA 3.1 8B or fallback.", style_td)],
        [Paragraph("<code>POST</code>", style_td_code), Paragraph("<code>/api/demo/generate</code>", style_td_code), Paragraph("<code>require_admin</code>", style_td_code), Paragraph("200", style_td), Paragraph("Seeds database with 20 customers, 50 products, 100 orders.", style_td)],
        [Paragraph("<code>DELETE</code>", style_td_code), Paragraph("<code>/api/demo/clear</code>", style_td_code), Paragraph("<code>require_admin</code>", style_td_code), Paragraph("200", style_td), Paragraph("Purges transactional tables for clean presentation resets.", style_td)],
    ]
    t_api = Table(api_specs, colWidths=[0.6*inch, 1.9*inch, 1.2*inch, 0.5*inch, 2.3*inch])
    t_api.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('BOX', (0,0), (-1,-1), 0.8, border_color),
        ('INNERGRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, bg_alt]),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_api)
    story.append(PageBreak())

    # ==========================================
    # SECTION 7: DESIGN PATTERNS REALIZED IN CODE
    # ==========================================
    story.append(Paragraph("7. Software Design Patterns Realized in Code", style_h1))
    story.append(Paragraph(
        "In accordance with <b>Ian Sommerville SE10 Chapter 7 (§7.3)</b>, BizAI explicitly implements four recognized design patterns:",
        style_body
    ))

    patterns = [
        [Paragraph("Design Pattern", style_th), Paragraph("Implementation Location in Repository", style_th), Paragraph("Architectural Rationale & Behavior", style_th)],
        [Paragraph("<b>Strategy Pattern</b>", style_td), Paragraph("<code>backend/services/ai_service.py</code>", style_td), Paragraph("Decouples AI inference provider from business consumers. The system dynamically selects between cloud Groq LPUs (Meta LLaMA 3.1 8B) and local keyword-matching deterministic fallback.", style_td)],
        [Paragraph("<b>Facade Pattern</b>", style_td), Paragraph("<code>backend/services/report_service.py</code>", style_td), Paragraph("<code>build_business_snapshot()</code> provides a simple, unified interface over complex relational aggregations across orders, products, inventory movements, and expenses.", style_td)],
        [Paragraph("<b>Dependency Injection</b>", style_td), Paragraph("FastAPI <code>Depends()</code> in all routers", style_td), Paragraph("Injects database sessions (<code>get_db</code>), authenticated users (<code>get_current_active_user</code>), and authorization guards (<code>RoleChecker</code>) cleanly without hardcoding dependencies.", style_td)],
        [Paragraph("<b>Repository Pattern</b>", style_td), Paragraph("<code>backend/services/*.py</code> modules", style_td), Paragraph("Isolates raw SQLAlchemy ORM model queries within dedicated service functions, preventing HTTP controllers from coupling directly to persistence mechanisms.", style_td)],
    ]
    t_pat = Table(patterns, colWidths=[1.4*inch, 2.1*inch, 3.0*inch])
    t_pat.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('BOX', (0,0), (-1,-1), 0.8, border_color),
        ('INNERGRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, bg_alt]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_pat)
    story.append(Spacer(1, 8))

    # ==========================================
    # SECTION 8: VERIFICATION, TESTING & DEPLOYMENT
    # ==========================================
    story.append(Paragraph("8. Verification, Testing & Deployment", style_h1))
    story.append(Paragraph(
        "<b>Verification & Validation (Sommerville SE10 Ch. 8):</b> System correctness was verified across three levels:<br/>"
        "1. <b>Automated Pydantic Compile-Time Validation:</b> Request payloads are checked before handler execution. Invalid types, missing emails, or negative stock quantities return HTTP 422 immediately.<br/>"
        "2. <b>Transactional Integrity Test Cases:</b> Simulated order confirmation with insufficient inventory verifies that the database state rolls back cleanly without partial stock deduction.<br/>"
        "3. <b>End-to-End Sandbox Simulation:</b> The built-in demo engine (<code>/api/demo/generate</code>) populates 20 customers, 50 products, 100 orders, and 30 expenses, validating all aggregation formulas under load.<br/>"
        "<b>Cloud Deployment:</b> Configured via <code>render.yaml</code> for automated cloud deployment, supporting Gunicorn/Uvicorn workers on Linux hosts with PostgreSQL add-ons.",
        style_body
    ))

    # Build PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated Implementation PDF at: {output_path}")

if __name__ == "__main__":
    out_file = r"c:\Users\asus\Desktop\code\Git\bizai\docs\Implementation_Document_BizAI.pdf"
    create_implementation_pdf(out_file)
