# AUTOSP website copy (v1, 16 Nov 2026)

Source of truth: the product repo `Neverfinished005/autonomous-security-platform` (docs/product.md,
docs/decisions.md, docs/onboarding-runbook.md, PROGRESS.md, docs/reliability/). Every claim below is
traceable there. Items marked **[CONFIRM]** are not in the product repo and need the founder's yes.

Honesty rules the copy follows (product.md, D-044): no "clean" or "secure" for zero findings; never
"satisfies SOC 2"; no security guarantee; DAST and AI pentesting are not advertised (frozen); a
recommendation is never called a fix; results always carry their caveat.

---

## 0. Navigation
AUTOSP · How it works · Verification · Security · Results · FAQ · **Apply for the free pilot**

## 1. Hero
**Security fixes, proven before you merge.**

AUTOSP finds vulnerabilities in your Python code, or takes them from your scanner, and turns each one
into a pull request with proof. A person always decides what merges.

[Apply for the free pilot] [See how it works]

For Python teams on GitHub · Works with Semgrep, CodeQL, Snyk Code and osv-scanner

## 2. The problem
**Finding vulnerabilities is easy. Closing them is the work.**

Your scanner hands you a list. Every item still needs someone to prove it's real, write a safe fix and
convince a reviewer nothing else broke. Without a security engineer on the team, the list grows until a
SOC 2 audit or a customer's security questionnaire asks what you did about it.

## 3. How it works
**One finding, from report to merged fix.**

1. **Find.** AUTOSP scans the repositories you choose with Semgrep and osv-scanner, inside its sealed
   sandbox. Already run a scanner? Send its results (Semgrep, CodeQL, Snyk Code, osv-scanner) instead,
   or as well.
2. **Reproduce.** An agent writes a test that exploits the finding and runs it on your code as it is.
   The test has to fail. No failing test, no patch.
3. **Fix.** A second agent writes the smallest fix it can, in a disposable copy of your code: no
   network, read-only, non-root, with a time limit. The copy is deleted when the job ends.
4. **Verify.** Three independent gates check the fix. The agents can't see or change them.
5. **Review.** AUTOSP opens a pull request with the evidence and stops. Your reviewers merge it.
6. **Keep it fixed.** After you merge, AUTOSP offers a second pull request that adds the reproduction
   test to your suite, so if the bug comes back, your CI fails.

## 4. Verification
**Three gates. Any one of them can send a fix back.**

- **Gate 1. The exploit fails now.** The reproduction test that failed before must pass on the
  patched code.
- **Gate 2. So do the variations.** A set of attack variants is run against the fix, judged by rules
  AUTOSP owns, not by the agent that wrote the fix. For SQL injection: 18 variants, judged by the
  shape of the query the database actually receives.
- **Gate 3. Nothing else broke.** Your existing test suite still passes, a fresh Semgrep scan no
  longer reports the finding, and the patch didn't touch your tests, CI or scanner settings.

**What gets rejected:** fixes that only look right. Stripping quotes, a denylist of bad characters, or
rebuilding the query with an f-string all fail. Only a parameterized query passes.

## 5. When it can't prove a fix
**An honest "unresolved" beats a false "fixed".**

- **Inconclusive.** If the finding can't be reproduced, no patch is written. You get the reason.
- **Needs human review.** If a gate can't give real evidence, the fix isn't called verified.
- **Recommendation.** When AUTOSP can't fix something with proof, it can tell you exactly what to
  change instead. A recommendation is advice, and it's never counted as a fix.

## 6. You stay in control
**AUTOSP never merges. Not even when every check passes.**

- Works through a GitHub App, installed on the repositories you pick, not your whole organization.
- It asks for four permissions only: Contents (to create its branch), Pull requests, Checks, and
  Metadata. It never asks for Administration, so it can't change or bypass your branch protection.
- Only a person's approval of the exact commit AUTOSP created counts as approving the fix.
- Need to undo a merged fix? AUTOSP can open a clean revert pull request. You merge that too.
- AUTOSP never acts on repositories outside the scope you signed.

## 7. Security and your code
**Built for code you can't afford to leak.**

- **Sealed sandbox.** Every job runs with no network, a read-only file system and a non-root user,
  under a hard time limit.
- **Disposable copies.** Each job gets a fresh copy of your repository, deleted afterwards. Git history
  is never copied into the agents' workspace.
- **Minimal context to the AI model.** The model sees the finding and the specific files it reads,
  never your whole repository.
- **Your code is data, never instructions.** Code, comments and scanner text can't steer the agents.
  This is tested against prompt-injection attacks.
- **Offboarding.** Uninstall the App and AUTOSP stops immediately.
  **[CONFIRM]** what is kept afterwards (proposal: only the audit trail of ids, hashes and outcomes, no
  code; with counsel).

## 8. Evidence for your audit
**Every step on the record, and the record can't be quietly changed.**

- **Tamper-evident log.** Each step is written to an append-only log, and each entry carries the
  fingerprint (SHA-256) of the one before it. Change any entry and the chain breaks.
- **Evidence pack.** For each pilot: every verified fix and how it was checked, every finding not
  fixed and why, suppressed findings, cost, and limitations.
- **False-closure audit.** A person re-checks verified fixes (every one, for each customer's first 20)
  to catch any that don't actually close the issue.
- **Compliance export [CONFIRM: awaiting founder approval in the product repo].** Verified, merged
  fixes mapped to SOC 2 CC7.1 / CC8.1 and ISO 27001:2022 A.8.8, A.8.28, A.8.32.

It's evidence that supports a security review or audit. It isn't a compliance attestation.

## 9. Results
**Early results, on our test applications.**

| Run set | Date | Verified |
|---|---|---|
| SQL injection, after the Gate 2 fix | 22 Oct 2026 | 5 of 5 |
| Access control (IDOR), after the Gate 2 fix | 22 Oct 2026 | 5 of 5 |
| Built-in scan: XSS / dependency upgrade | 22 Oct 2026 | 5 of 5 / 1 of 1 |
| Mixed run set | 2 Nov 2026 | 15 of 15 |

Plus: **0 merges made by AUTOSP**, and known-bad fixes rejected every time.

**Read this before the numbers.** Test applications and a free development model, not customer code
and not the production model. Small samples: an early signal, not a benchmark.

**Optional trust story [CONFIRM: is it OK to publish?]:** "On 22 October we found that six fixes had
passed a check that didn't really test them. None had been merged. We reclassified all six, fixed the
check, and re-ran. That's the point of keeping an honest record."

## 10. What it covers today
- **Languages:** Python repositories on GitHub, with a test suite that runs offline (unittest
  compatible).
- **Vulnerabilities:** SQL injection, cross-site scripting, insecure direct object references
  (from your scanner's findings; the built-in rules don't detect it), and vulnerable dependencies.
- **Scanners:** built in (Semgrep, osv-scanner), or bring yours (Semgrep, CodeQL, Snyk Code,
  osv-scanner; other SARIF accepted with a warning).
- Unsupported findings are never silently dropped. Each one is listed with a reason.

## 11. The pilot
**Try it on your own code.**

For engineering teams of 20 to 150 with no dedicated security engineer, especially with a SOC 2 audit
or security questionnaire coming up.

What you need:
- a signed scope document naming the repositories in scope;
- the people who will review AUTOSP's pull requests;
- a test suite that runs offline.

What you get: verified pull requests, and at the end, an evidence pack across everything AUTOSP did.

**[CONFIRM]** "free" and the timeline (the old site said Week 1 connect, Week 2 first pull requests,
Week 4 evidence pack). Neither is in the product repo.

Nothing touches your code until you've signed a scope agreement.

[Form: name, work email, company, team size, scanners you run (optional), note]

## 12. FAQ
- **Does AUTOSP replace my scanner?** No. It can run Semgrep and osv-scanner for you, but its job is
  closing findings, not finding more of them. Keep your scanner if you have one; AUTOSP fixes what it
  reports.
- **Can it merge by itself?** No. Not in any configuration. Your reviewers merge.
- **Which languages?** Python on GitHub today.
- **Which vulnerabilities?** SQL injection, XSS, insecure direct object references and vulnerable
  dependencies.
- **What does the AI model see?** The finding and the specific files it needs. Never your whole
  repository, never your Git history.
- **What if it can't fix something?** It says so: inconclusive, needs human review, or a
  recommendation that's clearly marked as advice.
- **Will a passing scan mean my app is secure?** No. "No findings from these scanners" is all a scan
  can say, and that's how AUTOSP reports it.
- **What if I edit AUTOSP's pull request?** You can, but then AUTOSP can't vouch for the result. The
  merge is recorded, but not as a verified fix.

## 13. Final call to action
**Your scanner did its job. Let's finish it.**
[Apply for the free pilot]

## Footer
AUTOSP by Nexarise · Sample evidence pack · 3D tour
AUTOSP does not guarantee that an application is secure. Results shown are from test applications.

---

## Corrections to the current website
1. **"14 of 16 runs verified" is out of date and overstated.** The product team corrected it to
   **11 of 16** on 22 Oct 2026 (D-045): three IDOR fixes had passed a hollow Gate 2. Remove 14/16.
2. **"AUTOSP only fixes your scanner's findings" is out of date.** Since D-044 (22 Oct 2026) it
   also runs Semgrep and osv-scanner itself.
3. The scope list was incomplete: IDOR is supported (from customer findings).
