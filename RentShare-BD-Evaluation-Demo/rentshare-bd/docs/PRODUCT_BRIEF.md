# RentShare BD — one-day evaluation scope

## Product purpose

Help tenants and students in Bangladesh discover an affordable place to live and compare potential roommates using preferences they can understand and control. Landlords provide the property inventory; tenants browse rentals and complete a roommate preference profile.

## Source brief

This demo follows the user's previously uploaded **RentShare_BD_Project_Idea_Updated-3.pptx**, available during implementation at `/Users/shoeb/Downloads/RentShare_BD_Project_Idea_Updated-3.pptx`.

Relevant presentation sections:

| Presentation | Demo interpretation |
| --- | --- |
| Slide 3: tenant and landlord roles | Separate registration roles and role-appropriate actions. |
| Slide 5: profiles, property filters, location, budget, and facilities | Persistent profiles; landlord listing creation; tenant browsing, filters, and detail views. |
| Slide 6: weighted compatibility and explanations | An explicit percentage accompanied by factor contributions and reasons. |
| Slide 19: rule-based matching service separate from AI | A deterministic rule engine, clearly labeled as rule-based. |

The presentation includes a broader long-term product. The user's evaluation request deliberately limits this implementation to the four connected features below.

## Included journeys

**Landlord:** register or sign in → edit profile → create a property → see the property in the searchable inventory.

**Tenant:** register or sign in → edit profile → browse and filter listings → open property details → save roommate preferences → inspect compatible profiles and understand the score.

Both journeys support logout and persisted data across app restarts.

## Preference and compatibility design

The user provides a budget range, location, smoking preference, cleanliness preference, sleep schedule, noise preference, and work/study schedule. The matching service compares the seven factors independently, then adds their weighted contributions.

A percentage is an estimate of **preference alignment under the displayed rules**, not a probability that two people will live well together. The explanation is part of the result: users can see the matching factors and the differences. The system does not infer personality, analyze identity documents, or claim that a match is safe or verified.

## Data and architecture decisions

- React and Vite provide the interface; Express provides the API.
- SQLite uses a local file for persistence, so the supervisor can run the demo without installing a database service.
- The server enforces authentication and role/ownership rules. Hiding an action in the interface is not the only access control.
- Demo records are synthetic and seeded locally.
- The matching service is separate from the interface so its behavior can be tested directly.
- MySQL/Prisma can be considered after the evaluation; no untested migration layer is included.

## Explicitly deferred

Payments, shared expenses, chat, booking requests, ML/AI matching, document verification, trust/reliability scores, reviews, complaint handling, scam detection, rent valuation, and duplicate-image detection are outside this evaluation scope.

## Evaluation criteria

The demo succeeds when the supervisor can observe real account access, a new listing appearing in the inventory, filters returning relevant listings, preferences persisting after reload, and an explainable compatibility result that changes when preferences change.
