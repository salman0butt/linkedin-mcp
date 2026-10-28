# M17.0 OAuth callback lifecycle — implementation plan

1. Create isolated worktree from exact verified `main` (`cef8e979…`); preserve root and historical worktrees.
2. Add a real TCP regression that holds an unrelated incomplete HTTP request while completing a valid callback; run Node24 to see a behavior RED, not an environment failure.
3. Implement narrowly scoped callback listener teardown after the actual response completes, closing slow/half-open connections without truncating the legitimate response. Cover terminal errors, timeout and explicit close; preserve exact external protocol.
4. Run focused, full and compiled STDIO/HTTP Node24 suites; formatter, linter, typecheck, build and diff checks. Seek strictly independent adversarial reviewer Critical 0/Important 0.
5. Update milestone and traceability without claiming M17 complete, commit/push, exact SHA/tree/blob review, PR CI SUCCESS, guarded merge and separate merged-main push CI SUCCESS.
