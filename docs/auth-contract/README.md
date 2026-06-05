# Auth Contract

The main Lumex website remains the source of truth for:

- authentication
- identity
- website role
- buyer linkage
- warehouse assignments

The analytics system should support two integration modes:

1. JWT verification against the main website issuer
2. internal service-to-service permission sync for `dim_user`, bridge tables, and `analytics_access_policy`

The current code scaffold uses development headers to simulate source identity:

- `x-source-user-id`
- `Authorization: Bearer dev-user-<id>`

Replace that bootstrap flow before production rollout.
