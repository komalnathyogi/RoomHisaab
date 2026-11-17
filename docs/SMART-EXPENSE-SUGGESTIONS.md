# Smart expense item suggestions — v7.2.5

## Behavior
Suggestions are local-only and deterministic; no network or third-party classifier is used. They combine a static English/Hinglish catalogue, common transliteration aliases and recent matching room expense descriptions. Typo matching uses bounded edit-distance matching, results are deduplicated and capped at six. Empty input returns no suggestions.

## Safety and compatibility
Suggestions fill description and a category from the existing supported category IDs. They do not save an expense, infer a payer, mark anything paid or launch a payment. Amount from a recent item is only a prompt that the user can inspect/edit. Supabase's currently allowed category set is documented in the source compatibility notes; do not add unsupported IDs without a reviewed migration.

## Validation
Smoke tests cover `aloo` → potato, `doodh` → milk, typo `onin` → onion, six-result cap and empty query. Full smoke result: 81 passed, 0 failed. Browser dropdown/keyboard selection E2E coverage exists but could not execute because the installed Chromium lacks host library `libnspr4.so`.
