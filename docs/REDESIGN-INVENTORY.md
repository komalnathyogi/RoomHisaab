# Redesign inventory — v7.2.5

Inventory derived from the active React Router configuration and source, not a browser walkthrough. “Source changed” is not equivalent to a visually verified route.

| Route / surface | Active content | v7.2.5 treatment | Verification limit |
|---|---|---|---|
| `/` | Landing, sample demo, FAQ, About, Contact | Nav order/label updated; hero is viewport-lazy 3D with static fallback | Browser rendering blocked |
| `/onboarding` | Local/cloud room creation | Existing flows retained; shared theme tokens | Browser flow blocked |
| `/login`, `/recover` | Account sign-in and recovery | Routes and auth logic unchanged | Auth/provider not live-tested |
| `/join` | Room-code or cloud invite join | Existing local/cloud paths retained | Browser/cloud not tested |
| `/room` | Dashboard, balances, summaries | Borrowing-history link added when records exist | Browser route blocked |
| `/room/buy` | Add Expense / Quick Pay / QR scan | Expense suggestions available in expense form; scanner safety retained | Camera/payment app not tested |
| `/room/history` | Expense records and loans | Borrowing tab; legacy borrow route points here | Browser assertions blocked |
| `/room/payments` | Settlement/payment records | Existing calculations and confirmation retained | No UPI/device proof |
| `/room/insights` | Trends and reports | Existing report calculations retained | Browser/visual check blocked |
| `/room/members` | Member management | Shared styling; existing actions retained | Cloud/RLS not live-tested |
| `/room/rules` | Recurring expenses | Existing logic retained | Browser check blocked |
| `/inbox` | Room notifications | Existing actions retained | Browser check blocked |
| `/settings` | Account, room, appearance, data, install, about, help, danger | Data/Install order corrected; About/Help remain before Danger Zone | Browser check blocked |
| `/room/guide`, `/room/about` | Help and About | Existing content retained | Browser check blocked |
| `/demo` | Redirect to landing demo section | Existing route retained | Browser check blocked |
| Legacy aliases | `/room/my`, `/room/borrow-lend`, `/guide`, `/help`, `/home`, `/history` | Redirects retained; borrowing alias includes `?tab=borrowing` | Browser check blocked |
| Unknown route | Not found | Existing safe navigation fallback | Browser check blocked |

Shared application routes use the existing Layout, route-level lazy loading, loading skeletons, theme tokens and persistence. Detailed loading/empty/error and control verification still requires a working browser run; this inventory does not claim every state was clicked.
