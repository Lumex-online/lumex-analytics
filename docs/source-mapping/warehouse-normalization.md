# Warehouse normalization notes

Canonical warehouse identity must be resolved before analytics data is trusted.

## Required mapping inputs

- source table name
- source warehouse id
- source warehouse code
- source warehouse name
- canonical warehouse key
- mapping status

## Enforcement rule

Any row without a resolved canonical warehouse should be excluded from scoped user analytics and surfaced in a data-quality report for admin review.
