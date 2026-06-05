# Lumex Analytics

Production-minded starter monorepo for the Lumex analytics platform.

## Apps

- `apps/api`: Fastify analytics API with permission-aware route scaffolding
- `apps/lumex-backend`: lightweight Lumex source API serving the legacy master collections on `/api/v1/*`
- `apps/web`: React dashboard shell with scoped navigation and dashboard pages
- `apps/jobs`: Node.js ETL and aggregate job runner scaffold

## Packages

- `packages/shared-types`: shared DTOs, filter contracts, and permission models
- `packages/analytics-core`: shared scope and metric helpers

## Infra

- `infra/migrations`: PostgreSQL schema bootstrap for analytics dimensions, facts, and access policies

## Local start

1. Copy `.env.example` to `.env`
2. Install dependencies with `npm install`
3. Run `npm run dev`

## Current status

This repo contains the implementation foundation:

- workspace setup
- analytics schema proposal in SQL
- bootstrap permission resolver
- dashboard and admin API shells
- React dashboard route structure

The data layer is intentionally scaffolded around temporary bootstrap data until the real Lumex source systems are connected.
