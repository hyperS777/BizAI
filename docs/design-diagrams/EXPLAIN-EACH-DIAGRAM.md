# BizAI Design Diagram Explanation Guide

This file explains each diagram in a way that can be used during the design presentation with Sir.

## 1. System Architecture Diagram
Purpose:
- Shows the overall structure of the system.
- Explains how the user interacts with the frontend and how the backend connects to the database and AI layer.

What to say:
- The system is built using a React frontend and a FastAPI backend.
- The frontend sends requests to the backend for login, customer management, orders, invoices, and reports.
- The backend stores data in PostgreSQL and uses a grounded AI layer to answer business questions using stored data.

## 2. Use Case Diagram
Purpose:
- Shows who the users are and what actions they can perform.
- It explains the system from a user perspective.

What to say:
- Admin can manage users, customers, products, orders, reports, and AI queries.
- Manager handles customers, products, orders, and reports.
- Employee mainly works on inventory and order operations.
- Accountant handles invoice generation and payment tracking.
- This diagram shows the system is designed for business workflow roles rather than only one user type.

## 3. Data Flow Diagram (DFD)
Purpose:
- Shows how data moves through the system.
- Helps explain how information flows between the UI, backend, database, and AI layer.

What to say:
- The user enters data in the frontend.
- The frontend sends requests to the FastAPI backend.
- The backend validates and stores data in PostgreSQL.
- Reports and dashboards are generated from the saved data.
- The AI layer uses the database context to answer business questions.

## 4. Login Sequence Diagram
Purpose:
- Shows the flow of authentication in the system.
- Explains how the request passes through the frontend, backend, and database.

What to say:
- The user enters email and password in the login page.
- The frontend sends a login request to the backend.
- The backend checks the user record in PostgreSQL.
- If valid, the backend returns a JWT access token.
- The frontend then requests the current user profile and loads the dashboard.

## 5. Order Flow Sequence Diagram
Purpose:
- Shows how an order is created and processed step by step.
- Explains the interaction between the UI, API, and database.

What to say:
- A manager or employee creates an order through the React frontend.
- The backend validates the customer and checks stock availability.
- The system saves the order, saves the order items, and updates inventory.
- The system confirms the order creation and shows invoice status.

## 6. Database Design Diagram / ER Diagram
Purpose:
- Shows the relations between tables in the database.
- It helps explain the logical structure of the application.

What to say:
- Users create orders and expenses and ask AI questions.
- Customers place orders.
- Categories contain products.
- Products appear in order items.
- Orders generate invoices.
- This design helps maintain consistency, reporting, and future scaling.

## 7. Class Diagram
Purpose:
- Shows the main code classes and their relationships.
- Helps explain how the application is structured at the software design level.

What to say:
- The User class represents system users and roles.
- Customer, Product, Order, OrderItem, Invoice, Expense, and AIQuery are core business classes.
- These classes are connected by relationships such as composition and association.
- This diagram proves the project follows object-oriented design principles.

## Final presentation note
A strong presentation should move in this order:
1. System Architecture
2. Use Case Diagram
3. Data Flow Diagram
4. Sequence Diagram
5. Database Design
6. Class Diagram

This follows a clean story: what the system is, who uses it, how data flows, how actions happen, how the database is structured, and how the code is organized.
