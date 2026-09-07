# Campaign sending pace

For one recipient, the UI asks only when to send (and which timezone), with a single-email confirmation. Pace and daily-cap controls are hidden in creation, review, the list and details. The single-email form submits a neutral interval and no campaign cap; hidden invalid pace values do not block it. Switching back to multiple recipients restores the user's previous pace settings and validates them again.

The Schedule step uses “Time between emails (minutes)” and “Emails per day (optional)” with visible explanations. Users can choose “Use no daily cap” instead of discovering that an empty field removes the cap. The schedule and review steps preview real planned times using the same calculation as job creation.

For 50 recipients starting at 09:00, a five-minute interval and a cap of 20 schedule 20 emails on day one (09:00–10:35), 20 on day two, and 10 on day three (09:00–09:45).

Daily batches are separated by at least 24 elapsed hours from their starting time, not a midnight reset in the display timezone. Long intervals extend the schedule: a batch never overtakes the preceding batch or shortens the selected interval. Without a campaign cap, jobs continue at the selected interval across midnight. Daylight-saving changes can change the displayed local hour; persisted times are UTC instants.

The preview describes planned sends, not guaranteed delivery times. Worker cadence, account/system limits and retries can delay sending. Existing scheduled jobs are not rescheduled by this change.

Shared calculation: `lib/scheduling/campaign.ts`. Tests cover normal batching, no cap, midnight rollover, one email per day, invalid values, overlapping-batch prevention, job persistence and the UI preview.
