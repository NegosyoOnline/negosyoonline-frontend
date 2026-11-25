# Branch notes: z8uq9mjx0r SMS window 22:00

Branch `feat/z8uq9mjx0r-sms-window-22`, cut from `origin/main` ef9ae9e. Task z8uq9mjx0r.

Ruling (Coach Ed, 2026-11-25, "make the range from 8am to 10pm"): store Bulk SMS and Schedule SMS texts go out from 08:00 up to, not including, 22:00 Manila time (was 08:00 to 20:00). The backend changes separately; this branch changes the dash text and the time picker only.

## apps/dash
* `inbox-bulk.js`: the outside-window pause text and the rules line now say 8:00 am to 10:00 pm.
* `inbox-schedule.js`: `TO = 22 * 60`; the picker offers 8:00 am to 9:45 pm (56 slots, 22:00 not offered); the two outside-window messages say "08:00 to 22:00 Manila time"; the rules line and the hint say 10:00 pm.
* `contacts.js`: comment only. There is no contact maximum any more; the code already shows "N contacts saved" when max is null.
* `index.html`: cache buster `?v=20261125w1` on `inbox-bulk.js`, `inbox-schedule.js` and `contacts.js` only.
* Tests: window fixtures end "22:00"; picker tests expect 56 slots with 21:45 allowed and 22:00 and 07:45 outside the window; the "no time left today" tests moved to 21:36 and 21:35 Manila; new contacts test for max null.
