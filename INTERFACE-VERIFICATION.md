# Interface verification — October 25, 2026

## Changes
- One Account entry in the guest menu replaces the separate Welcome / Sign in and Log in / Create account actions.
- The account sheet is titled Account. Google/email options serve both new and returning accounts; enabled providers and secure backend identity handling are unchanged. The welcome screen explains this shared flow.
- Removed the standalone Meetings tab. Upcoming meetings remain in their associated development details, with official project sources and explicit unavailable/past-information messaging.
- Removed the unused global meeting-feed request and pagination state from the map browser. Public meeting API and stored meetings remain available; project details load their own meetings.
- Preserved the existing map, status filters, clusters, state colors and administrator permissions.

## Browser tests
Used a separate localhost test server/database containing only three fictional projects, with a fixture verifier confined to that server. No test identity or authentication bypass was added to the application.
- Review group -> Compare records -> choose conflicting name -> confirmation preview -> merge: succeeded.
- Canonical ID retained while the chosen name was used; original records and both meetings remained shown in the preview.
- Undo Merge -> confirmation: restored prior relationships and fields.
- Supporting-record preview -> confirm -> Undo Supporting Link: succeeded.
- Review Later and Not a Duplicate: counters and review state updated correctly.
- Live public site: project details display the 306 West Franklin hearing; guest Follow Development opens Account; Continue as Guest dismisses it; menu contains one Account action.
- Live dataset: 11,945 stored records, 1,127 public map records; all 969 duplicate candidates retained. No live merges or deletions were performed.

## Automated checks
All 58 tests passed, including transactional merge rollback, original/follow/history/source preservation, conflicting meeting IDs, safe undo, stale previews, token ownership and administrator/MFA authorization. TypeScript passed. Expo web and iOS/Hermes exports succeeded.

## Limits
Your existing Auth0 tab is at MFA enrollment; no enrollment credential was entered or changed. Real-account administrator login after completing enrollment was not exercised. Administrative UI behavior was exercised with the isolated fixture; real backend authorization was checked by the HTTP/JWT tests. Apple, billing and actual device notification delivery were not live-tested. iOS export is not a physical-iPhone test.

This change improves meeting placement; it does not collect additional meetings or alter their dates.
