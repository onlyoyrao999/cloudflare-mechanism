# Firebase Security Specification (Security Spec)

This document outlines the attribute-based access control (ABAC) matrix, data invariants, and the threat modeling ("Dirty Dozen" payloads) for the Macau Lottery Prediction & Analysis Firestore database.

## 1. Data Invariants

Our data layout consists of two primary operational collections:
- `/saved_predictions/{predictionId}`: Users can record historical or upcoming predictions with custom annotations.
- `/user_trackers/{trackerId}`: Users can configure trackable alarm triggers on specific lottery numbers.

### Critical Invariants:
1. **Implicit Identity Safeguard**: A document's `userId` must strictly equal the claimant's verified authentication key (`request.auth.uid`). No spoofing of records belonging to other users.
2. **Email Verification Wall**: All write requests (creation, updates, deletion) must be authenticated by users with verified email addresses (`request.auth.token.email_verified == true`).
3. **Temporal Sanity**: Timestamps (`createdAt`, `updatedAt`) must be tied directly to the server time (`request.time`) instead of trust-unworthy client clocks.
4. **ID Sanitization**: Document IDs must pass a strict matches test (`^[a-zA-Z0-9_\-]+$`) with a maximum length of 128 characters to thwart injection attacks.

---

## 2. The "Dirty Dozen" Payloads (Threat Matrix)

Below are the 12 attack vectors representing invalid payloads. Our `firestore.rules` will strictly refuse (`PERMISSION_DENIED`) each case.

| # | Collection / Path | Operation | Attack Description / Malicious Payload | Reason for Refusal |
|---|---|---|---|---|
| 1 | `/saved_predictions/bad-id-&&&` | Create | Inject characters in the document ID. | Document ID fails character regex validation. |
| 2 | `/saved_predictions/p1` | Create | Unauthenticated user attempts to save a prediction. | Missing authentication token `request.auth`. |
| 3 | `/saved_predictions/p1` | Create | authenticated user `user123` sets `userId` field to `attacker789`. | Spoofing `userId` field fails equality check with `request.auth.uid`. |
| 4 | `/saved_predictions/p1` | Create | Save a prediction with an unverified email address account. | `email_verified` is false or missing. |
| 5 | `/saved_predictions/p1` | Create | Save prediction with additional ghost fields (e.g. `{ isPremiumUser: true }`). | Fails strict schema keys matching or length validation. |
| 6 | `/saved_predictions/p1` | Create | Save record with fraudulent client timestamp `createdAt` (e.g. yesterday). | Timestamp does not equal server timestamp `request.time`. |
| 7 | `/saved_predictions/p1` | Update | Change the immutable fields `userId` or `createdAt`. | Update block detects affectedKeys contains read-only properties. |
| 8 | `/saved_predictions/p1` | Read | Fetch someone else's saved prediction. | Query / Read gate checks `resource.data.userId == request.auth.uid`. |
| 9 | `/saved_predictions/p1` | Update | inject oversized string (e.g. 1MB notes block) to drain wallet. | Failing size check validation (`size() <= 2000`). |
| 10| `/user_trackers/t1` | Create | An authenticated user sets a tracker for someone else. | `userId` must match `request.auth.uid`. |
| 11| `/user_trackers/t1` | Update | Modify tracker database rules by adding unwhitelisited keys. | Fails strict `affectedKeys().hasOnly(['monitoredNumbers', 'updatedAt'])`. |
| 12| `/user_trackers/t1` | Read | Read trackers belonging to another user. | Fails owner-validation gate check. |

---

## 3. Defensive Security Rules Formulation

We define reusable, robust helpers in our `firestore.rules` to enforce these invariants cleanly. The final validated Ruleset will be stored in `firestore.rules`.
