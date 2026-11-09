# SPEC-ODL-02 — Ocean Studio coverage review

**Date:** 2026-11-08
**Scope:** Frontend-only RTL Ocean Design System Studio, not permission to enable missing production components.
**Official sources:**
- Tabler UI component documentation: https://docs.tabler.io/ui/components
- Tabler admin template catalogue: https://tabler.io/admin-template
- shadcn/ui sidebar and data patterns: https://ui.shadcn.com/docs/components/radix/sidebar and https://ui.shadcn.com/docs/components/base/data-table
- Ant Design components: https://ant.design/components/overview/ and RTL ConfigProvider: https://ant.design/components/config-provider
- Material UI components: https://mui.com/material-ui/all-components/

## Why these examples matter
Tabler presents production-oriented admin categories (navigation, tables, forms, overlays, pagination, states, widgets), while shadcn/ui documents composable icon-collapsed sidebars and client-owned data tables. Ant Design offers a strong business-form taxonomy and explicit RTL configuration; MUI offers broad feedback/navigation coverage and documents Stepper and extensible data-grid options. Ocean should reuse its own existing React/Tailwind components, not add third-party design-system dependencies.

## Prioritized component coverage

| Area | Ocean status | TADBIR priority | Recommendation |
|---|---|---|---|
| Buttons, badges, semantic tokens | Already present | Maintain | Keep existing Button/Badge tokens, responsive states and accessible feedback. |
| Inputs, Select, Jalali Date Picker | Already present | Maintain | Keep shared controls and validate RTL search/popup edge cases. |
| Table, DataTable, pagination | Already present | Maintain | Reuse for operational records and large datasets. |
| Alerts, toasts, dialogs, drawers | Already present | Maintain | Preserve semantic overlay stacking/focus and Amendment B elevation. |
| RTL and mixed-direction text | Present, incomplete | High | Audit mixed Persian/English IDs, dates, numbers, focus and wrapping. |
| Cross-viewport keyboard and a11y audits | Present, incomplete | High | Add Playwright and manual keyboard/mobile checks. |
| Command palette / quick navigation | Missing, valuable | Medium | Implement only behind scoped, permission-aware targets. |
| Advanced composable filters | Missing, valuable | High | Add filter presets and URL-state contracts for large SaaS tables. |
| Multi-step wizard/stepper | Missing, valuable | Medium | Suitable for long admin forms after validation UX contract. |
| Tree view for organizational hierarchy | Missing, valuable | Medium | Use only where nested data needs it, with keyboard semantics. |
| Guided product tour production activation | Prototype only | Future UX-04 | Needs permissions, progress versioning and analytics contract. |
| Editable dashboard persistence | Prototype only | Future UX-01 | Needs schema versioning, entitlement checks and server persistence. |
| Ratings, transfer lists | Out of MVP | Defer | No demonstrated product requirement. |
| Decorative carousels, excessive motion | Out of MVP | Defer | Avoid visual complexity; prefer quiet feedback and reduced motion. |

## Amendment C geometry review
- Accepted primary content container: **24px**.
- Studio-only proposed primary content container: **28px**.
- Accepted standalone card: **20px**.
- Accepted nested flat panel: **16px**.
- Accepted controls: **12px**.
- Approved elevation baseline: **0 1px 3px rgb(15 23 42 / 0.035)**.
- The 28px comparison uses the same static shadow before and during hover. It is not a production default or ADR approval.

## Integration guardrails
No new external component dependency was added. The Studio is routed only beneath /theme-previews, does not mount production Sidebar, auth, billing or permission controllers, and operates on mock data. International designs are research references, not source components to copy. Browser screenshots, computed-style evidence and human review remain pending until executed.
