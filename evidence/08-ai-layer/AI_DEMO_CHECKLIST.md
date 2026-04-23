# AI Layer Demo Checklist

## What to show

1. n8n workflow `exam-submit-notify.json`.
2. Webhook trigger for exam submission.
3. Trust Score branching.
4. Email to student.
5. Email to proctor when score is low.
6. OPAL/OPA policy decision output.

## Evidence files to collect

- n8n execution screenshot
- workflow canvas screenshot
- OPAL policy decision output
- role change proof
- email notification proof if Mailpit is used

## Suggested commands

- Import workflow from `n8n/workflows/exam-submit-notify.json`
- Submit an exam attempt
- Query OPA decision endpoint
- Show executions in n8n

## Live defense note

The point of this block is to prove that rules and notifications are automated, not manually faked.
