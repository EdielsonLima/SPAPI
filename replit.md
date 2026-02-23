# SPAPI - Sistema de Gestao

## Overview
A Next.js 14 management system (Sistema de Gestao) for a construction company, integrating with the Sienge API. Built with TypeScript, Tailwind CSS, and shadcn/ui components. Uses NextAuth for authentication with credential-based login.

## Project Architecture
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui (Radix primitives)
- **Auth**: NextAuth v4 with credential provider
- **External API**: Sienge API for construction management data
- **Charts**: Recharts

## Project Structure
```
src/
  app/             - Next.js App Router pages & API routes
    (authenticated)/ - Protected routes (dashboard, cadastros, financeiro, suprimentos)
    api/           - API endpoints (auth, sienge proxy)
    login/         - Login page
  components/      - React components (UI + feature components)
    ui/            - shadcn/ui base components
  lib/             - Utilities (auth config, sienge client, utils)
  types/           - TypeScript type definitions
  middleware.ts    - Auth middleware for protected routes
```

## Configuration
- **Dev server**: Port 5000, host 0.0.0.0
- **Environment Variables**: NEXTAUTH_URL, NEXTAUTH_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, SIENGE_API_URL, SIENGE_BULK_API_URL, NEXT_PUBLIC_COMPANY_NAME, NEXT_PUBLIC_COMPANY_SUBTITLE, NEXT_PUBLIC_COMPANY_EMAIL_DOMAIN
- **Default login**: admin / admin

## Key Dependencies
- **sonner**: Toast notifications
- **jspdf + jspdf-autotable**: PDF export for data tables
- **recharts**: Charts on dashboard and contas pages

## Recent Changes
- 2026-02-23: Added Suprimentos section with Pedidos de Compra page
  - New sidebar section "Suprimentos" with "Pedidos" sub-item
  - API proxy route for /purchase-orders endpoint with pagination support
  - Full-featured table with search, pagination (client-side 20/page + server-side 200/batch), PDF export
  - Summary cards (Valor Total, Autorizados, Pendentes)
  - Expandable rows showing order details (empresa, obra, frete, desconto, observacoes)
  - On-demand items loading with delivery schedule status per item
  - Delivery control: Previsao, Entregue, Pendente columns with status badges (Entregue/Parcial/Aguardando)
  - API routes for /purchase-orders/{id}/items and /purchase-orders/{id}/items/{itemNumber}/delivery-schedules
  - Status badges (Autorizado/Pendente/Reprovado) with icons
  - Breadcrumbs updated in header
  - Middleware updated to protect /suprimentos/* routes
- 2026-02-16: Complete UI/UX overhaul
  - Dashboard: welcome message with real-time clock, 5 clickable financial summary cards, monthly Recharts chart
  - Sidebar: overdue bills badge (red count), version footer (SPAPI v1.0.0)
  - Header: breadcrumbs navigation, mobile page title display
  - Cadastro tables (Empresas, Centros de Custo, Plano Financeiro): refresh button, PDF export, error states with retry, improved skeletons
  - Contas tables: Sienge connection indicator (green/red dot), toast notifications, error/empty states with retry
  - Mobile: hamburger menu via Sheet, responsive grids, truncated breadcrumbs
  - Fixed bill observations API URL (duplicated /v1 path)
  - On-demand notes fetching (per-bill when expanded) to avoid rate limiting
- 2026-02-16: Initial Replit setup - configured port 5000, allowed dev origins, set environment variables
