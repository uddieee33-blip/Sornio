# Companion feature matrix

Source of truth: `packages/mobile-contracts/src/capabilities.ts`, derived from
`lib/portals/catalogue.ts` and `lib/portals/blueprints.ts`.

Classes: **F** full mobile · **R** read-only · **L** limited action · **D** desktop-only · **P** planned.

Android, iPhone and iPad share the class. iPad uses the same behaviour with a
rail + list/detail layout rather than a stretched phone UI.

| Module | Desktop | Android | iOS | iPad | Roles | Offline (cached) | Sync | Backend | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cockpit | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Owner Home |
| dashboard | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Tiles on Home |
| insights | F | P | P | P | all | no | no | missing | Hosted AI |
| alerts | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Cached alerts |
| business | F | L | L | L | all | yes | yes | hybrid-sync-v1 | Identity only |
| catalog | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Search / details |
| scan | F | D | D | D | all | no | no | missing | USB scanner hardware |
| inventory | F | R | R | R | all | yes | yes | hybrid-sync-v1 | No deductions. Hidden for gym |
| checkins | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Overview only; fingerprint pad is D |
| appointments | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Visibility |
| sales | F | R | R | R | all | yes | yes | hybrid-sync-v1 | History. No create |
| billing | F | R | R | R | all | yes | yes | hybrid-sync-v1 | History. No create |
| payments | F | R | R | R | all | yes | yes | hybrid-sync-v1 | History. No collect |
| expenses | F | R | R | R | all | yes | yes | hybrid-sync-v1 | History. No create |
| transactions | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Activity screen |
| marketing | F | P | P | P | all | no | no | missing | Phase 4 |
| memberships | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Overview |
| reminders | F | P | P | P | all | no | no | missing | Desktop/web drafts |
| customers | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Balances / statements |
| suppliers | F | P | P | P | all | no | no | missing | Phase 4 |
| team | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Settings overview |
| cashflow | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Summary |
| profitability | F | R | R | R | all | yes | yes | hybrid-sync-v1 | Summary |
| reports | F | R | R | R | owner, manager, auditor | yes | yes | hybrid-sync-v1 | Simplified |
| comparisons | F | P | P | P | all | no | no | missing | Phase 4 |
| audit | F | R | R | R | owner, manager, auditor | yes | yes | hybrid-sync-v1 | Status, not a browser |
| security | F | L | L | L | owner, manager | yes | yes | hybrid-sync-v1 | Session / cache. Vault restore is D |
| settings | F | L | L | L | all | yes | n/a | none | Appearance, sign out |
| subscription | F | D | D | D | owner | no | no | missing | Not sold in-app in Phase 1 |

## Hardware exclusions (never required on mobile)

USB counter scanner, fingerprint-pad attendance, cash drawer, full thermal
printer configuration, SQLCipher vault restore, complex inventory reconciliation.

Camera barcode scanning is **P**. Phone biometrics unlock the app session only.

## Business types

gym, cafe, kirana, salon, electronics, boutique, service, general.

Gym omits inventory / scan. Salon and service include appointments. Kirana
keeps khata vocabulary. See `vocabulary.ts`.
