# z8uq9mjx4e: All my members shows every group chip

Ruling (Coach Ed, 2026-11-25): All my members stays one option; the Send to chips then list every group with its contact count.

- Bulk SMS (`inbox-bulk.js`) and Schedule SMS (`inbox-schedule.js`): while All is chosen, `drawChips` shows the All chip first ("All my members (N)", N = server `will_send`, with its remove), then one display-only chip (no remove) per group in `st.groups.list`.
- Group chip label is `g.label`, built by `groupItems` as "Name (count)" from the group's `count` field (name alone when the list has no count), the same label the dropdown options use.
- The group list load redraws the chips again (the redraw fix 6 had removed), so the chips appear once the groups arrive.
- Confirm total unchanged: the server's `will_send`.
- Removing the All chip clears all of them.
- Cache busters: `inbox-bulk.js` and `inbox-schedule.js` `?v=20261125g1`; `inbox.test.mjs` pin updated.
- Stacked on feat/z8uq9mjx0r-sms-window-22 (575bda8). Reverses fix 6 (b766ae3) in behaviour. No TWCinc code.
