Machinery Rental System – AI Agent Engineering Guide

## AI AGENT RULE
If this file exists in the repository, read it before implementing any task.

Purpose

This document defines the engineering rules and architecture conventions for AI agents working on the Machinery Rental System.

It helps ensure that all automated changes remain consistent, safe, and compatible with the existing system.

AI agents must read this document before implementing any task.

Source of Truth

The codebase is always the source of truth.

If documentation and code differ:

Codebase

Database schema

migration-log.md

architecture.md

ai-agent-guide.md

AI agents must never modify working code to match outdated documentation.

Always audit the current implementation before making changes.

## System Map (Important)

Key system modules and where they live in the codebase.

Orders
- Repo: src/lib/rental/orders/db-order-repo.ts
- Public API: src/app/api/public/rental/orders/route.ts
- Admin UI: src/app/admin/rental/orders/page.tsx

Invoices
- Repo: src/lib/rental/invoices/db-invoice-repo.ts
- Admin API: src/app/api/admin/rental/invoices/route.ts
- Invoice detail page: src/app/admin/rental/invoices/[id]/page.tsx

Payments
- Repo: src/lib/rental/invoices/db-payment-repo.ts
- Admin API: src/app/api/admin/rental/invoices/[id]/payments/route.ts
- Payment recording is atomic via DB function

Email delivery
- Helper: src/lib/rental/invoices/email-delivery.ts
- Send route: src/app/api/admin/rental/invoices/send/route.ts
- Reminder route: src/app/api/admin/rental/invoices/remind/route.ts
- Receipt route: src/app/api/admin/rental/invoices/receipt/route.ts

Invoice exports
- Invoice CSV export: src/app/api/admin/rental/invoices/export/route.ts
- Payments ledger export: src/app/api/admin/rental/payments/export/route.ts

Admin invoice list
- Page: src/app/admin/rental/invoices/page.tsx

## Files AI Should Not Modify Without Strong Reason

src/lib/rental/invoices/db-payment-repo.ts
- Contains atomic payment logic

src/lib/rental/invoices/email-delivery.ts
- Shared email pipeline

src/app/api/admin/auth/**
- Authentication logic

## Project Structure

Monorepo layout:

MachineryRentalSystem/
  rental-system-frontend/    ← Next.js application
  docs/                      ← architecture + migration logs + AI rules

Main application code lives inside:

rental-system-frontend/

Important folders inside the app:

src/app/                     ← Next.js App Router pages & API routes
src/lib/                     ← business logic, repos, helpers
src/lib/rental/              ← rental system domain modules
Technology Stack

Frontend

Next.js (App Router)

TypeScript

Tailwind CSS

Backend (Next.js API routes)

Node.js runtime

Supabase Postgres

Supabase Storage

Infrastructure

Supabase (database + object storage)

Resend (email sending)

pdf-lib (invoice PDF generation)

Architecture Principles

The system follows a DB-first architecture.

Persistent system data must be stored in the database.

LocalStorage must never be used as a system-of-record.

Core Modules
Orders

Database table:

rental_orders

Orders are created via:

POST /api/public/rental/orders

Admin pages load orders directly from the database.

Invoices

Database table:

rental_invoices

Invoice lifecycle:

draft → issued → void

Rules:

One invoice per order

Invoice created from order

Invoice lifecycle status is separate from payment status

Payments

Database table:

rental_invoice_payments

Payments are recorded for invoices.

Payment writes must be atomic and DB-validated.

The system uses a database function to prevent concurrent overpayment.

Payment status is derived, not stored directly.

Derived payment statuses:

unpaid
partially_paid
paid
overdue

Rules:

if balance <= 0 → paid
else if paid > 0 → partially_paid
else unpaid

if due_date < now and balance > 0 → overdue

If due_date is null, invoice must never be marked overdue.

Invoice Email System

Email history is stored in:

rental_invoice_emails

Each email event inserts a log entry.

Events may include:

send
resend
reminder

Email sending uses:

Resend API
Invoice PDF Storage

Invoice PDFs are generated server-side using:

pdf-lib

Stored in:

Supabase Storage bucket

Metadata is saved inside:

rental_invoices.pdf_storage

Example:

{
  path,
  generatedAt,
  sha256
}

Existing PDFs should be reused whenever possible.

Do not regenerate PDFs unnecessarily.

Admin Authentication

Admin API routes must always be protected.

Protected routes:

/api/admin/**

Authentication is enforced using:

assertAdmin(req)

Admin login endpoint:

POST /api/admin/auth/token

Admin session is stored via cookie.

All admin fetch requests must include:

credentials: "include"
API Design Rules

Prefer small incremental changes.

Never break existing API response shapes unless absolutely necessary.

Reuse existing repo helpers and service functions whenever possible.

Avoid creating parallel patterns or duplicate repositories.

Coding Style

Use:

TypeScript strict mode

Follow existing patterns in:

src/lib/rental/*

Prefer:

small safe refactors

reuse existing helpers

minimal file changes

Avoid:

large architectural rewrites

introducing new libraries unnecessarily

Database Rules

Database schema changes must:

Be placed under

docs/sql/

Be applied manually in Supabase SQL Editor.

Be recorded in the migration log.

Never assume migrations have been applied.

Documentation Workflow

Two documentation files must be maintained.

architecture.md

Purpose:

High-level system architecture.

Update only when:

major modules are added

system structure changes

migration-log.md

Purpose:

Incremental development history.

Append-only log of system changes.

Update whenever changes involve:

database schema

API routes

infrastructure integration

storage changes

email/PDF flows

authentication changes

Each entry must include:

Date
Scope
Summary
Files changed
DB / Infra changes
API changes
Manual test checklist

Never rewrite existing entries.

AI Agent Workflow

Before implementing any task:

Audit the relevant code files.

Confirm current architecture.

Identify risks or mismatches.

Plan minimal safe changes.

Required Response Format

All AI-generated implementation responses must follow:

A) Audit

B) Implementation plan

C) Code changes

D) Verification

This ensures:

the agent understands the codebase

changes are safe

verification steps exist

Implementation Safety Rules

AI agents must:

prefer smallest possible code change

preserve existing architecture

preserve DB-first design

reuse existing services

AI agents must not:

reintroduce localStorage as a data source

bypass admin auth guards

duplicate invoice/payment logic

regenerate PDFs unnecessarily

Testing Expectations

Every change must include a manual test checklist.

Typical tests include:

API route validation

UI interaction

refresh persistence

auth enforcement

DB state verification

Final Rule

Always audit the codebase before writing code.

Never assume architecture based solely on documentation.

If code and documentation differ, the codebase is the source of truth.

## Common Tasks

Adding a new admin API
- Place under src/app/api/admin/**
- Must use assertAdmin(req)

Adding DB queries
- Prefer existing repo files in src/lib/rental/**

Adding new email flows
- Reuse email-delivery.ts
- Log events in rental_invoice_emails

Adding exports
- Follow the CSV route pattern used by invoice export