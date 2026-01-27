# Collection UI Implementation Plan v1.0

**Sprint:** Sprint 1
**Feature:** Collection UI (COLLECTION_UI_spec.md)
**Priority:** P0 - Critical
**Status:** Design Integrity APPROVED (GO)

---

## Pre-Implementation Decision

**Dynasty Naming:** Use database values (CYBER/PRIMAL/COSMIC). Deprecate hardcoded EMBER/CRYSTAL/VOID.

---

## Task Breakdown (5 Phases, 5 Milestones)

### Phase 1: Foundation (M1 - Layout Skeleton)

| Task | Files | Deps | Size |
|------|-------|------|------|
| 1.1 Extend collectionStore with UI state | `collectionStore.ts` | - | S |
| 1.2 Create useDynastyTheme hook | `hooks/useDynastyTheme.ts` | - | S |
| 1.3 Create useCollection hook | `hooks/useCollection.ts` | 1.1 | M |
| 1.4 Create LabHeader component | `components/lab/LabHeader.tsx` | - | S |
| 1.5 Create DynastyTabs component | `components/lab/DynastyTabs.tsx` | 1.2 | M |
| 1.6 Create EmptySlot component | `components/lab/EmptySlot.tsx` | 1.2 | S |
| 1.7 Create CollectionGrid skeleton | `components/lab/CollectionGrid.tsx` | 1.5,1.6 | M |
| 1.8 Refactor lab page | `app/lab/page.tsx` | 1.3-1.7 | M |

**M1 Checkpoint:** Tabs + grid skeleton render, tab switching works.

### Phase 2: Data Integration (M2 - APIs Connected)

| Task | Files | Deps | Size |
|------|-------|------|------|
| 2.1 Create VariantCard component | `components/lab/VariantCard.tsx` | 1.2 | M |
| 2.2 Connect useCollection to APIs | `hooks/useCollection.ts` | 2.1 | M |
| 2.3 Add loading states | `CollectionGrid.tsx` | 2.2 | S |
| 2.4 Add error handling | `collectionStore.ts` | 2.2 | S |
| 2.5 Add progress indicator | `CollectionProgress.tsx` | 2.2 | S |

**M2 Checkpoint:** Real data from APIs, owned/locked states visible.

### Phase 3: Interactions (M3 - Tap/Swipe Work)

| Task | Files | Deps | Size |
|------|-------|------|------|
| 3.1 Create VariantDetailModal | `VariantDetailModal.tsx` | 2.1 | L |
| 3.2 Create UnlockConfirmModal | `UnlockConfirmModal.tsx` | 2.1 | M |
| 3.3 Add swipe gesture | `DynastyTabs.tsx` | 1.5 | M |
| 3.4 Wire card tap handlers | `VariantCard.tsx` | 3.1,3.2 | S |
| 3.5 Add modal state to store | `collectionStore.ts` | 3.1,3.2 | S |

**M3 Checkpoint:** Modals open/close, swipe changes tabs.

### Phase 4: Unlock Flow (M4 - Transactions)

| Task | Files | Deps | Size |
|------|-------|------|------|
| 4.1 Implement unlock action | `useCollection.ts` | 3.2 | M |
| 4.2 Add optimistic update | `collectionStore.ts` | 4.1 | M |
| 4.3 DNA balance validation UI | `UnlockConfirmModal.tsx` | 4.1 | S |
| 4.4 Implement equip action | `useCollection.ts` | 3.1 | M |
| 4.5 Add equip API endpoint | `api/collection/equip/route.ts` | 4.4 | M |
| 4.6 Wire equip button | `VariantDetailModal.tsx` | 4.4,4.5 | S |

**M4 Checkpoint:** Full unlock + equip flow works end-to-end.

### Phase 5: Polish (M5 - Graders Pass)

| Task | Files | Deps | Size |
|------|-------|------|------|
| 5.1 Tab switch animation | `DynastyTabs.tsx` | 3.3 | S |
| 5.2 Card tap animation | `VariantCard.tsx` | 3.4 | S |
| 5.3 Unlock success animation | `UnlockConfirmModal.tsx` | 4.2 | M |
| 5.4 Error toast integration | `*.tsx` | All | S |
| 5.5 Empty state handling | `CollectionGrid.tsx` | 2.3 | S |
| 5.6 Write component tests | `__tests__/*.test.tsx` | All | L |
| 5.7 Performance optimization | `CollectionGrid.tsx` | All | M |

**M5 Checkpoint:** All graders pass, ready for merge.

---

## Graders

### Deterministic (Automated)

| ID | Check | Command | Pass |
|----|-------|---------|------|
| DG-01 | TypeScript | `npm run build` | 0 errors |
| DG-02 | Unit tests | `npm test -- --grep Collection` | 100% pass |
| DG-03 | Lint | `npm run lint` | 0 errors |
| DG-04 | Touch targets | Axe audit | >= 44px |
| DG-05 | Lighthouse | Mobile audit | >= 90 |

### LLM Graders

| ID | Focus | Agent | Pass |
|----|-------|-------|------|
| LLM-UX-001 | UX Review | UX Reviewer | >= 7.0 |
| LLM-CODE-001 | Code Quality | Code Quality Reviewer | >= 7.0 |

### Human Verification (15 tests)

| ID | Test | Expected |
|----|------|----------|
| HV-01 | View collection | Tabs + grid visible |
| HV-02 | Tap dynasty tab | Tab switches |
| HV-03 | Swipe dynasty | Tab switches |
| HV-04 | Tap owned card | Detail modal opens |
| HV-05 | Close modal | Returns to grid |
| HV-06 | Tap locked card | Unlock modal opens |
| HV-07 | Insufficient DNA | Button disabled |
| HV-08 | Successful unlock | DNA deducted, card owned |
| HV-09 | Equip snake | Snake marked equipped |
| HV-10 | Scroll grid | 60fps smooth |
| HV-11 | Dynasty theming | Colors change |
| HV-12 | Progress indicator | Shows X/Y |
| HV-13 | Empty dynasty | "Coming soon" |
| HV-14 | Network error | Error toast |
| HV-15 | Art placeholder | Gradient fallback |

---

## File Creation Order

1. `src/hooks/useDynastyTheme.ts`
2. `src/lib/stores/collectionStore.ts` (extend)
3. `src/hooks/useCollection.ts`
4. `src/components/lab/EmptySlot.tsx`
5. `src/components/lab/LabHeader.tsx`
6. `src/components/lab/DynastyTabs.tsx`
7. `src/components/lab/VariantCard.tsx`
8. `src/components/lab/CollectionProgress.tsx`
9. `src/components/lab/CollectionGrid.tsx`
10. `src/components/lab/VariantDetailModal.tsx`
11. `src/components/lab/UnlockConfirmModal.tsx`
12. `src/app/api/collection/equip/route.ts`
13. `src/app/lab/page.tsx` (refactor)
14. `src/components/lab/__tests__/*.test.tsx`

---

## Risks

| Risk | Mitigation |
|------|------------|
| Art not ready | Gradient placeholders |
| Scroll perf | Virtualized list |
| Swipe conflicts | Dedicated swipe zone |
| Unlock race | Optimistic UI + reconciliation |
