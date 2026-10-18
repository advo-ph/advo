# SUPERSEDED — folded into Phase 2

This phase (push alerts via webhooks) is no longer separate. The user has since confirmed
alerts fire on **every** `activity_log` row, human-made edits included — not just bot writes —
which requires the generic change-log middleware. That middleware and the write tools it
complements belong in the same phase, so push alerts are now built as part of Phase 2
(`advo-mcp_phase-2-write-tools_PLAN_18-10-26.md`, §5–§8: generic logging, `member_webhook` +
`webhook_delivery` schema, the delivery poller, and the Settings → Members webhook UI).
See the umbrella's §3 "What changed from the stale draft" for the full rationale.
