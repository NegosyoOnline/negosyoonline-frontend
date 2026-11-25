# z8uq9mjx4e: All my members shows every group chip

Ruling (Coach Ed, 2026-11-25): All my members stays one option; the Send to chips then list every group with its contact count.

- Bulk SMS (`inbox-bulk.js`) and Schedule SMS (`inbox-schedule.js`): while All is chosen, `drawChips` shows the All chip first ("All my members (N)", N = server `will_send`, with its remove), then one display-only chip (no remove) per group in `st.groups.list`.
- Group chip label is `g.label`, built by `groupItems` as "Name (count)" from the group's `count` field (name alone when the list has no count), the same label the dropdown options use.
- The group list load redraws the chips again (the redraw fix 6 had removed), so the chips appear once the groups arrive.
- Confirm total unchanged: the server's `will_send`.
- Removing the All chip clears all of them.
- Cache busters: `inbox-bulk.js` and `inbox-schedule.js` `?v=20261125g1`; `inbox.test.mjs` pin updated.
- Stacked on feat/z8uq9mjx0r-sms-window-22 (575bda8). Reverses fix 6 (b766ae3) in behaviour. No TWCinc code.

## Second pass: ALL-GROUPS-OPTION (Coach Ed, 2026-11-25)

"All my members" is replaced by "All groups" (first entry, never preselected). Audience value stays "all" and now means every contact in any store group, each phone once; `will_send` is that total.

- Chip: "All groups (N)" with x, then the display-only "Name (count)" group chips. Removing it clears them all.
- Copy: confirm "Send to N contacts from your phone?" (pick wording unchanged); "One text for every contact in your groups, sent from your own phone."; "Contacts who replied STOP are skipped."; count error "We could not count your contacts just now."; 409 fallback "Your contact count changed. ...".
- Old scheduled items and history rows with audience "all" show "All groups" (AUDIENCES label).
- 400 invalid_audience still shows the server's message.
- Cache busters `inbox-bulk.js` and `inbox-schedule.js` `?v=20261125g2`.
