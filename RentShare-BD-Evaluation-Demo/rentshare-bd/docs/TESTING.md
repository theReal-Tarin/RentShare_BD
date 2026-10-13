# RentShare BD — verification notes

## Current status

Automated checks verified on **8 October 2026**; final build and browser rehearsal verified on **9 October 2026**, using **Node.js 24.11.0**. Automated checks, the production build and principal browser journeys passed.

| Check | Result |
| --- | --- |
| Matching unit tests | **8 passed, 0 failed**. |
| API integration tests | **9 passed, 0 failed**, exercising actual HTTP requests against isolated SQLite databases. |
| Supervisor score example | Verified directly: Ayesha → Nusrat is 95%; changing Ayesha's sleep schedule to Regular gives 100%. |
| Production build | **Passed** with `npm run build`. |
| Browser rehearsal | **Passed** in the Codex in-app browser: both registration roles, normal and demo login, invalid-password feedback, logout, profile persistence, listing creation/details, combined text/location/budget search, preference persistence and score changes. |
| Responsive layout | **Passed** at desktop and 390px mobile width, including mobile navigation; document width matched viewport width. |
| Browser console | No error logs during the recorded walkthrough. |

The final automated run was `npm run build && npm test`: **17 passed, 0 failed, 0 skipped**. An earlier API test attempt was prevented by the environment's local socket permission; the run above succeeded after that permission was granted.

## Automated coverage

- Registration for tenant and landlord; successful login; invalid password; duplicate email; logout invalidating the session.
- Server-side role and ownership checks for property actions.
- Profile and roommate preference validation, with persistence across reopening the database.
- Listing creation, detail lookup, and location/budget filters.
- Compatibility calculations, explanations, and score changes after preference edits.
- No password hashes in API responses and no private email addresses in roommate discovery.
- Matching weights sum to 100; complete alignment/mismatch, symmetric scoring, and budget edge cases.

Run the automated checks from the project folder with:

```sh
npm test
```

Tests use isolated databases rather than the persisted demo database.

## Manual rehearsal checklist

- [x] Start the app using only the README.
- [x] Sign in as landlord, create a listing, and view its saved details.
- [x] Log out and sign in as tenant.
- [x] Find the new property using location and budget filters.
- [x] Save all seven roommate preferences and reload.
- [x] Read a match's factor contributions and explanation.
- [x] Change a relevant preference; verify the candidate's score changes coherently.
- [x] Register a fresh tenant and a fresh landlord.
- [x] Confirm invalid form inputs produce useful feedback.
- [x] Confirm the layout remains usable at a narrow mobile width.
- [x] Build and start the single-server app.

## Browser evidence

Browser rehearsal used a separate `work/browser-qa.sqlite` database. A landlord created “Evaluation room near DIU” at ৳6,500 in Ashulia; the tenant found it using the title, location and a ৳7,000 maximum. Fresh tenant and landlord registration worked. A profile occupation survived reload. Ayesha’s saved sleep change raised Nusrat’s match from 95% to 100%, with the sleep contribution changing from 5/10 to 10/10. The delivered app keeps its original six-listing seed data.

Screen previews accompany the delivered archive. Desktop and mobile layout checks were performed separately.

## What passing tests do not establish

These checks establish behavior for this local demonstration. They do not establish production scalability, independent security certification, real-world listing accuracy, verified user identity, or the predictive validity of the compatibility rules.
