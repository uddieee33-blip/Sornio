# Remaining blockers

1. Obtain exact-patch installed Windows build, native automation, offline lifecycle, upgrade, real printer, scanner, and display/accessibility evidence. The historical PR-head pass is not exact-patch acceptance.
2. Review and test the remaining financial, RBAC, secret-storage and recovery paths beyond the sampled suites, including independent ledger reconciliation and real operational recovery drills. No hardware power-loss guarantee was tested.
3. Keep replication, LAN, GST and Android production checkout/sync isolated. The two ignored replication tests were not run.
4. Recover the reported local-only U1 commit from its original machine if required; no prior local checkout was supplied.
5. Review patches and run exact-head CI only with explicit authorization for billable Windows CI. Do not merge or release on this report.

Rollback of the audit code commits can be reviewed with `git revert d7e0df66848abe73efdab92c287036467d5d650b e2240f3e39e000d4c9e74501fd3ae1d2c6d568c9 309b3fa64ce1c55869243d6084da6d4fa0ae0a69` on a new branch; do not run against live data. No migration was introduced. Reverting the finance fix restores the known cash-customer rejection.
