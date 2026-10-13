# RentShare BD — supervisor walkthrough

**Target time: 4 minutes.** Rehearse once before the evaluation. Use the seeded accounts so there are listings and roommate profiles available immediately.

## Before the meeting

1. Start the app using the README instructions.
2. Keep the app open at `http://127.0.0.1:5173` in development, or `http://127.0.0.1:3001` after building.
3. Keep these credentials ready: `tenant@rentshare.demo` and `landlord@rentshare.demo`, both with password `RentShare123!`.
4. For the predictable match example, the seeded tenant should have the original preferences: budget **৳5,000–10,000**, **Ashulia**, **Non-smoker**, **Very tidy**, **Early sleeper**, **Quiet**, **Daytime**. Seeding preserves edits, so restore these in the interface if a rehearsal changed them.
5. Prepare these listing values for quick copy/paste:

| Field | Value |
| --- | --- |
| Listing title | Supervisor Demo — Bright Student Room |
| Location | Dhanmondi |
| Street / address | Demo Road 7, Dhanmondi, Dhaka |
| Monthly rent | 8000 |
| Advance / deposit | 8000 |
| Bedrooms / bathrooms | 1 / 1 |
| Area | 250 sqft |
| Available from | 1 November 2026 |
| Furnishing | Furnished |
| About this home | A fictional demonstration room with a bright study space and a shared kitchen. Utilities are separate. |
| Amenities | Wi-Fi, Study desk, Kitchen |

## 0:00–0:25 — explain the product and scope

**Say:** “RentShare BD helps students and tenants find a suitable rental and a roommate with compatible living preferences. This evaluation implements four connected features: accounts, property discovery, preference profiles, and transparent rule-based matching.”

**Show:** the opening page and its property and roommate entry points.

## 0:25–1:25 — landlord creates a property

**Do:** choose **Sign in / Join → Landlord demo**. Open **My profile** briefly, then **Add a listing**. Enter the prepared values, select an illustrative photo, and choose **Publish listing**. Open the saved property from **My listings**.

**Say:** “Landlords have their own account role. A listing contains practical rental details such as the location, monthly rent, room availability, and facilities. This submission is stored in our local database and immediately becomes part of the searchable inventory.”

**Do:** close the property details and choose **Sign out** at the top right.

## 1:25–2:15 — tenant finds the property

**Do:** choose **Sign in / Join → Tenant demo**. In **Find a home**, select **Dhanmondi**, enter minimum rent **7000** and maximum rent **9000**, and choose **Search homes**. Open the property you just created.

**Say:** “The tenant can narrow the inventory by location and budget, then inspect the rental details. This connects the landlord's action to the tenant's actual experience.”

**Show:** the tenant profile. Point out that a new user can register directly with either role.

## 2:15–3:35 — preferences and explainable matches

**Do:** open **My preferences**. Show all seven factors: budget, location, smoking, cleanliness, sleep schedule, noise, and work/study schedule. Choose **Save preferences**, then **Roommate matches**.

**Say:** “The score is produced by a deterministic weighted rule engine. We are not calling this AI. Every factor contributes a visible portion of the total score, and the explanation shows both alignment and differences.”

**Do:** open **Why we matched** for **Nusrat Jahan**, initially **95%** with the original seed preferences. Point out the aligned budget and location, plus the sleep difference. Close the explanation, choose **Edit preferences**, change **Sleep schedule** from **Early sleeper** to **Regular sleeper**, and **Save preferences**. Return to **Roommate matches**: Nusrat is now **100%**, with sleep increasing from **5/10** to **10/10** points.

**Say:** “Because the rules are explicit, the result changes predictably when the preference changes. The percentage measures alignment with these preferences; it is not a guarantee of roommate compatibility.”

## 3:35–4:00 — show persistence and close

**Do:** reload and show that the saved preferences and created property remain. Log out.

**Say:** “We chose SQLite for a frictionless local evaluation, with React on the frontend and Express on the backend. The core journeys are working end to end. Payments, chat, booking, and machine learning remain future work so this demo stays focused.”

## Optional fifth minute: live registration

Register a fresh tenant using a unique address such as `supervisor-20261008@rentshare.demo` and a password of at least the form's required length. Show the empty/new preference state, then save preferences and view the seeded potential roommates. Use a different email if that address was used during rehearsal.

## If asked about the algorithm

Explain the displayed weights and per-factor contributions. The total is their sum, rounded for display. Budget considers range overlap; categorical and ordered preferences have explicit rules. The matching tests include complete alignment, complete mismatch, symmetry, and budget edge cases. Refer to `docs/TESTING.md` for the recorded results.

## If the meeting computer has no internet

Install dependencies and build the app in advance. Run the built app with `npm start`. The API, SQLite database, seed data, matching, and included illustrative photos run locally. Check the walkthrough once before going offline.
