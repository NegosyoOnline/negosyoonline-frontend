# CP-1 R2 FE, fix round 1 (ClickUp z8uq9mhbhd): a lesson completes by watching

Ruling (Coach Ed, 2026-11-22, logged on z8uq9med6x): the marking of complete is done by watching, not manually; unlock after watching at least 90%.

Changed (apps/storefronts):
- The member lesson page has no "Mark complete" and no "Mark this lesson complete first". Next Lesson is off with "unlocks at 90% watched" until the lesson is complete, and the unlock note sits under it.
- public/assets/sante/js/lesson-watch.js posts at 10% steps, always the first crossing of 90%, and `ended` (with `ended: true`). On `completed: true` it updates the page live (Next Lesson on, lesson ticked, next lesson opened in the list, counts).
- /dashboard/training/lesson/<id>/complete/ answers the neutral 404 to every method; the API call and handler for it are removed.
- The watch route passes `ended` on and returns `completed`, `next_unlocked`, `next_lesson_id`.
- apps/dash: Watch progress already shows "Completed" from the API's `completed`; no change.

TWCinc sources read and adapted (read only, nothing pasted):
- /Users/edgeronilla/Dev/twcinc/app/university/templates/university/course/lesson.html (Next Lesson, unlock note, list lock states)
- /Users/edgeronilla/Dev/twcinc/app/static/dashboard/subscriber/js/lesson-watch.js (COMPLETE_AT 0.90, `ended`, `lesson:completed` live update)
- /Users/edgeronilla/Dev/twcinc/app/university/views/course.py and app/university/services/ (sequential unlock; the rule is the backend's)

# CP-1 R2 FE, fix round 2 (ClickUp z8uq9mhbhd): video required

Ruling (Coach Ed, 2026-11-22): "all lessons has video... so it must be trackable. make the video required in our lessons".

Changed (apps/dash only; storefronts untouched, so no storefront change to confirm beyond that):
- Lesson editor: a lesson with no ready video shows "Video required. Upload a video before members can see this lesson." under the heading ("Add your video", or "Replace with your own video" for a legacy link) and above "Upload video".
- Course lesson list: a lesson needing a video shows "Video required" (was "Add your video").
- Course details: when any lesson needs a video, under "Show to members": "Every lesson needs a video before members can see this course." with the lessons listed as buttons that open each lesson's editor. The checkbox stays usable.
- Save with "Show to members" ticked and a 400 `video_required`: the message and the lesson titles from the response show under the box (alert), the box returns to the saved state (unticked for an Off course), no toast; the backend refuses the whole PATCH, so nothing else is applied and the typed fields stay for another try. The picture step is not reached.
- app.js flatten() now carries `lessons` of a wrapped error; the flat `{code, detail, lessons}` body is read as is.
- Copied courses arrive Off with the same rule; no extra hint was added.
- Tests added in apps/dash/tests/training.test.mjs; two existing label assertions updated.
