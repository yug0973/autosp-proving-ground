# AUTOSP product reel: research, script and storyboard (draft for approval, nothing rendered yet)

## 1. Research: what other tools do (from their own docs)

| Tool kind | What it does | What its own docs say about the result |
|---|---|---|
| Scanners (Semgrep, CodeQL, Snyk Code, osv-scanner) | Find vulnerabilities and report them | The output is a list. Someone still has to prove each item is real and write the fix. |
| GitHub Copilot Autofix | LLM-written fix suggestion on a code-scanning alert | GitHub: suggestions are LLM-generated; review and edit before accepting; use CI tests to catch mistakes. [docs](https://docs.github.com/en/enterprise-cloud@latest/code-security/responsible-use/responsible-use-autofix-code-scanning) |
| Snyk Agent Fix (was DeepCode AI Fix) | Up to 5 candidate fixes, retested with Snyk's own engine | Snyk: always review suggestions; they may not work properly or may be wrong; sometimes no valid fix is produced. [docs](https://docs.snyk.io/scan-fix-and-prevent/scan-with-snyk/snyk-code/manage-code-vulnerabilities/fix-code-vulnerabilities-automatically) |
| Semgrep Assistant | Triage plus autofix suggestions; a second AI prompt reviews the diff | Semgrep: a person decides whether to commit; may not run on every finding in a big scan. [docs](https://semgrep.dev/docs/semgrep-assistant/overview) |

The pain is real but the numbers are vendor surveys, so use them only as "directional":
Mondoo 2025 (53% overwhelmed by alerts; 62% remediate manually) and the Cloud Security Alliance 2024 remediation survey.

### What we can and cannot say
- CAN say: scanners report; suggestion tools propose and tell you to review; AUTOSP has a fixed rule set (below).
- CANNOT say: "others don't verify" (Snyk and Semgrep do retest in their own way) or "we are better".
  The product's own rule (docs/product.md): no competitor-superiority claim without a disclosed method.
- Truthful difference = process, taken from AUTOSP's own docs:
  1. A test that exploits the bug must FAIL first. No failing test, no patch.
  2. The fix is written in a sealed copy: no network, read-only, non-root, time limit, deleted after.
  3. Three gates the agents can't see or change: exploit now passes; attack variants (18 for SQL injection)
     judged by rules AUTOSP owns, not by the agent that wrote the fix; test suite passes, fresh scan clean of
     the finding, tests/CI untouched.
  4. It never merges. A person approves the exact commit.
  5. Every step goes to a tamper-evident log; "unresolved" is an allowed honest answer.

## 2. The idea: "The Thursday backlog" (an office story, not a text slide)

Format: vertical, about 40 seconds, one continuous office scene with a moving camera. Illustrated 3D-style
(not photoreal). One character, a developer, at a desk at night. Everything is shown, nothing is read out
from a slide. Props that carry the story: a monitor with the scanner list, a calendar, a chat ping.
Numbers on screen are marked "example".

## 3. Script and storyboard

| Time | What you see | Voiceover |
|---|---|---|
| 0:00-0:06 | Dark office, 6:40 pm. The developer's monitor shows a scanner report: a long red list. A calendar note: "audit in 12 days". A chat ping: "Can you complete our security questionnaire?" Camera pushes in slowly. | "Your scanner did its job. It found the problems. And now they're yours." |
| 0:06-0:13 | A colleague leans in: "Just ask the AI." A patch appears on screen. The developer stares at it, hand over the mouse, nobody presses merge. A question mark hovers over the diff. | "An AI can suggest a fix. But who proves it works, and that nothing else broke?" |
| 0:13-0:17 | The screen lights blue. A GitHub pull-request notification slides in: "autosp". The office brightens. | "That's autosp. It doesn't suggest. It proves." |
| 0:17-0:23 | Step 1-2. The finding is pulled into a glass room on screen. A test runs and turns red: "1 failed". | "It starts with a test that exploits the bug. The test has to fail first. No failing test, no patch." |
| 0:23-0:29 | Step 3. The code is copied into a sealed glass box (labels: no network, read-only). A small fix is typed: red line out, green line in. | "Then it writes the smallest fix, in a sealed copy of your code." |
| 0:29-0:35 | Step 4. Three gates, one after the other, light up green: the exploit fails now; 18 attack variants bounce off; the test suite passes. A fix that fails one gate is thrown back. | "Three checks, that the agent can't see or change. If any one fails, the fix goes back." |
| 0:35-0:40 | Step 5. A pull request opens with the evidence. "Merges made by autosp: 0." The developer clicks Merge. Dawn light in the window. | "Then it stops. autosp never merges. You do." |
| 0:40-0:44 | Logo and tagline. | "autosp. Verified security fixes." |

About 105 spoken words, which fits at a normal pace.

## 4. Decisions I need from you (defaults in bold; I will not render until you answer)
1. Look: **A) a 3D-style night office built in three.js (more "crazy", a real moving camera, takes longer)**,
   or B) a flat illustrated office with parallax layers (faster, less depth).
   A adds `@remotion/three` and `three` to the reel package only, not the website.
2. Length: **about 40-45 seconds**, or keep it to 20 seconds with fewer steps.
3. Voice: **an Indian-English male voice (en-IN) for the Ahmedabad audience**, or keep the current US voice.
4. Music: **a low, dry pulse that only rises in the gates scene**, or no music at all.
