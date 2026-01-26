# feature_collection_ui_specification_v1_0_3_4_api_i

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:37.468041+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Collection UI Specification v1.0: 3.4 API Integration

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/COLLECTION_UI_spec.md
**Captured:** 2026-01-26 10:26



## Content

```typescript
// hooks/useCollection.ts

export function useCollection() {
  const store = useCollectionStore();
  const dnaBalance = useDnaBalance();

  // Initial fetch on mount
  useEffect(() => {
    store.fetchDynasties();
    store.fetchVariants();
    store.fetchCollection();
  }, []);

  // Derived data
  const currentDynastyVariants = useMemo(() => {
    if (!store.activeDynastyId) return [];
    return store.getVariantsByDynasty(store.activeDynastyId);
  }, [store.activeDynastyId, store.variants]);

  const currentDynastyOwned = useMemo(() => {
    if (!store.activeDynastyId) return [];
    return store.getOwnedByDynasty(store.activeDynastyId);
  }, [store.activeDynastyId, store.ownedSnakes]);

  // Actions with validation
  const unlock = async (variantId: string) => {
    const variant = store.variants.find(v => v.id === variantId);
    if (!variant) throw new Error('Variant not found');
    if (dnaBalance < variant.unlockCostDna) {
      throw new Error(`Need ${variant.unlockCostDna - dnaBalance} more DNA`);
    }
    return store.unlockVariant(variantId);
  };

  return {
    ...store,
    currentDynastyVariants,
    currentDynastyOwned,
    dnaBalance,
    unlock,
  };
}
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
