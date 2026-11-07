# TADBIR Comprehensive — Future Product Ideas Registry

**Document ID:** PRODUCT-FUTURE-01  
**Date:** 2026-11-07  
**Owner:** Chief Software Architect / Product Owner  
**Status:** Product ideas and roadmap candidates — NOT implementation authorization  
**Suggested repository path:** `docs/product/future-ideas-registry.md`

> This registry prevents loss of important product ideas. Items marked APPROVED PRINCIPLE represent product decisions already expressed; detailed UX, acceptance criteria, implementation plans and release scopes may still be pending. Do not confuse this registry with delivered features or module activation.

## 1. Guided Product Tour / UX-TOUR-01

**Source:** Previously discussed product-tour idea; here formally consolidated.  
**Status:** ROADMAP — proposed technical and UX specification, not delivered.

### Purpose

Provide a contextual, skippable, resumable walkthrough for each of the three environments: personal workspace, organization management/workspace, and platform administration.

### MVP behaviors

1. On first eligible entry, show a brief welcome and a 3–6-step contextual tour: environment switcher, right RTL navigation/sidebar, dashboard, notifications, profile/quick help, first useful action.
2. Offer **Start**, **Skip**, **Next**, **Back**, **Finish**, and **Replay tour** through Help.
3. Do not automatically repeat a completed tour unless the content version changes and user policy permits showing updates.
4. Preserve per-user, per-environment and per-tour-version progress; remember a skipped state.
5. Anchor steps to semantic targets (`data-tour-id`) rather than brittle CSS selectors; skip unavailable targets safely.
6. Support RTL/LTR mixed content, keyboard-only navigation, visible focus, Escape dismiss, reduced motion, and mobile drawer navigation.
7. Only surface steps for capabilities and modules the current user can access. Never reveal privileged feature names/data by accident.
8. Start with static instructional content and mocked UI in Ocean Design Lab; later add server-backed progress in UX-04.
9. Enable specialized modules to register their own tours through a versioned `tour manifest` once module integration contracts are ready.

### Suggested integration contract (for later design; not approved API)

Tour manifest:

`{ tourKey, version, environment, requiredCapabilities[], steps:[{ stepKey, targetId, titleFa, bodyFa, placement, action? }] }`

Persist progress keyed by `(user_id, environment_type, environment_id, tour_key, version)` with status `not_started|in_progress|skipped|completed`, step cursor and timestamps. Org-specific visibility is permission-scoped.

### Dependencies

UX-04 contextual onboarding; Ocean Design Lab prototype; identity/permissions; feature/module registry; later SYS-MSG for introducing updated features.

### Distinguish from onboarding

- **Onboarding:** actionable first-use checklist (e.g., create project, invite member) and setup completion.
- **Tour:** contextual walkthrough of where things are and how to navigate.
- **Help center:** on-demand explainers available long after onboarding.

## 2. Editable Page Layout / UX-LAYOUT-01

**Source:** Prior UX-01 personalization direction and the owner's explicit request to retain page-layout editing as a future idea. The complete historical feature specification has not been independently recovered.  
**Status:** ROADMAP — proposed requirements; requires product owner UX decisions before code.

### Purpose

Let users enter **Edit layout** mode for supported dashboards/pages, rearrange and resize widgets, toggle visibility, and save/revert a personalized layout while maintaining safe responsive design.

### Proposed MVP

1. Feature-gate to explicitly supported pages, starting with the personal dashboard; avoid a generic arbitrary page builder.
2. **Edit layout** mode with keyboard-operable movement and visible drag handles, widget resize by grid span, show/hide permitted widgets, and **Save / Cancel / Reset to default**.
3. In the first release, personalization is scoped to **user + environment + page**; shared organization templates are a separately gated later extension.
4. Store layout as validated, versioned JSON with allowlisted widget IDs, grid positions/spans and preferences. Never store executable code or raw HTML.
5. Enforce widget permissions server-side even when saved layouts contain stale/unauthorized widgets.
6. Responsive strategy: desktop 12-column conceptual grid, smaller breakpoints remap to safe order; mobile gets a deterministic single-column view and an accessible reorder control.
7. Initial preview/prototype lives inside Ocean Design Lab with mocked data; production state and APIs only after explicit authorization and backend contract.
8. Avoid modifying established shell navigation, essential transactional forms, security/consent screens or admin workflow content via free layout editing.

### Future extensions (NOT MVP)

- Org-managed dashboard templates; role defaults; shared workspace layouts.
- Widget catalog/gallery, custom display settings and user-defined dashboards.
- Widget import/export with schema version migrations.
- Rule-based personalization and AI assistance, only with explicit permissions and privacy review.

### Possible data model (design candidate, not migration permission)

`core_user_page_layouts`:

`id`, `user_id`, `environment_type`, `environment_id`, `page_key`, `schema_version`, `layout_json`, `updated_at`

Unique constraint:

`(user_id, environment_type, environment_id, page_key)`

Use ownership and capability checks on every read/write; atomic revision or `version` for conflict control.

## 3. Core UI and UX opportunities

| ID | Idea | Classification | Related work |
|---|---|---|---|
| UX-TOUR-01 | Guided product tour / replayable contextual steps | Proposed | UX-04, Ocean Lab |
| UX-LAYOUT-01 | Editable page/dashboard widget layout | Proposed | UX-01, Ocean Lab |
| UX-ONBOARD-01 | First-use checklists per environment and role, resume | Approved principle | UX-04 / UX-CORE-01 |
| UX-HELP-01 | Integrated help center with searchable guides | Proposed | SUP-01 |
| UX-DISCOVERY-01 | Announce and teach newly released features | Proposed | SYS-MSG-01 |
| UX-TEMPLATE-01 | Ready-made personal/team/organization workspace templates | Proposed | Modules |
| UX-SEARCH-01 | Global cross-module search | Proposed | Shared platform service |
| UX-COMMAND-01 | Keyboard command palette / quick create | Proposed | Navigation / permissions |
| UX-FEEDBACK-01 | In-app feedback and roadmap suggestion collection | Proposed | SUP-01 |
| UX-AI-01 | Context-aware AI help/assistant | Future discovery only | Privacy, permissions, modules |

## 4. Module registry — existing registered domains (22)

**Important:** These are areas registered in product architecture, not proof that complete modules are production-ready.

### Shared domain areas (16)

1. Projects / پروژه‌ها
2. Tasks / وظایف
3. Calendar / تقویم
4. Goals / اهداف
5. Habits / عادت‌ها
6. Notes / یادداشت‌ها
7. Finance / مالی
8. CRM / مدیریت ارتباط با مشتری
9. HRM / منابع انسانی
10. Forms / فرم‌ها
11. Workflows / گردش‌کارها
12. Meetings / جلسات
13. Content / محتوا
14. DAM / مدیریت دارایی‌های دیجیتال و فایل
15. Chat / گفتگو
16. Operational Records / سوابق عملیاتی

### Specialized domain areas (6)

17. Events / رویدادها
18. Competitions / مسابقات
19. Challenges / چالش‌ها
20. Surveys / نظرسنجی‌ها
21. Campaigns / کمپین‌ها
22. Procurement / تدارکات و خرید

## 5. Candidate future modules and cross-module capabilities (NOT previously confirmed as approved modules)

The following entries are **brainstorming candidates**, not an assertion that these exact names were in the historic module plan. The known record mentions additional future domains but does not enumerate them.

| ID | Candidate | Why it may matter | Core dependencies |
|---|---|---|---|
| FUT-MOD-01 | Knowledge base / Wiki | Shared institutional knowledge | Content, Notes, permissions, search |
| FUT-MOD-02 | Help desk / Service desk | Internal service requests beyond platform SUP-01 | CORE-REQ, Forms, Workflows |
| FUT-MOD-03 | Inventory / Asset tracking | Stock and physical assets | Procurement, Operational Records |
| FUT-MOD-04 | Sales pipeline & quotations | Sales operations | CRM, Finance, Forms |
| FUT-MOD-05 | Time tracking & timesheets | Work analysis and labor hours | Tasks, HRM, Projects |
| FUT-MOD-06 | OKR / Strategy execution | Goal cascading and reporting | Goals, Projects |
| FUT-MOD-07 | Learning & training / LMS | Employee training and onboarding content | Content, Forms, HRM |
| FUT-MOD-08 | Booking / Resource scheduling | Rooms, equipment and appointments | Calendar, Workflows |
| FUT-MOD-09 | Customer portal | Restricted client collaboration | CRM, Forms, permissions |
| FUT-MOD-10 | Contracts & approvals | Contract lifecycle | DAM, Workflows, e-sign integration |
| FUT-MOD-11 | Reporting & BI studio | Cross-domain analytics | Data contracts, permissions |
| FUT-MOD-12 | Automation / Integrations catalog | Cross-module automation | Workflows, Integrations |
| FUT-MOD-13 | Marketplace / Module catalog | Discover/install optional domains | Registry, billing, capabilities |
| FUT-MOD-14 | AI assistance for modules | Guided work and summarization | ACL, audit, privacy |
| FUT-MOD-15 | Public API / Developer center | Third-party integrations | API governance, identity, audit |

**Decision rule:** Never treat these candidates as approved requirements or launch scope until product-owner review and a domain-specific spec.

## 6. What Frontend Agent can do next

**Suggested independent, bounded workstreams:**

- `FE-ODL-01`: Audit current `/theme-previews` and existing Ocean Lab commits; complete or propose the authorized scope for interactive RTL sidebar/header and mobile drawer. Do not assume that any read-only SPEC-ODL-01 plan was implementation authorization.
- `FE-UX-TOUR-PROTOTYPE`: A static/mocked guided tour in Ocean Lab to test placement, RTL, keyboard, reduced motion, skip/replay, and environment variants. Requires explicit implementation authorization.
- `FE-UX-LAYOUT-PROTOTYPE`: A mocked dashboard layout-edit mode in Ocean Lab: reordering/resizing allowed widgets, responsive fallback, cancel/reset, accessible controls. Requires explicit implementation authorization.
- `FE-UX-04-DESIGN`: Frontend contracts/wireframes and responsive onboarding flows coordinated with independent UX/UI Agent.
- `FE-C5-CATALOG`: Design contract for monthly/quarterly/annual price displays and disabled/unpublished periods; keep open Q5 catalog UX pending PO decision. No actual billing API assumptions.
- `FE-REGRESSION`: Real browser screenshots and accessibility at 1440×900, 834×1112, 390×844 for Amendment C and UX-REVIEW-013 when browser access is possible. Human acceptance stays deferred.

## 7. Status, ownership and change control

- **Approved current policy:** User-configurable per-plan billing periods; fixed-package subscriptions; no pro-rata balance at upgrade; core completion definition.
- **Existing planned work:** UX-01 personalization, UX-04 onboarding, Ocean Lab.
- **Proposed feature specs:** UX-TOUR-01, UX-LAYOUT-01 and candidate future modules.
- **Proposed repository action:** Have Development Agent commit this registry as documentation-only after checking existing docs to avoid duplicate/conflicting IDs. No code or DB changes under this step.
- No PR merge, force push, destructive operations, or production deploy without explicit permission.
