# Local StoreKit testing

`FAULT.storekit` mirrors the product catalogue in `server/src/domain/store.ts`
(ids, types and USD prices) so purchases can be exercised on the iOS
simulator without App Store Connect.

1. In Xcode: Product → Scheme → Edit Scheme → Run → Options → StoreKit
   Configuration → choose `store-testing/FAULT.storekit`.
2. Run the local server with `ALLOW_FAKE_PURCHASES=true` (development only —
   StoreKit test transactions are signed locally, so Apple's API cannot
   verify them and the server would correctly refuse them otherwise).

Keep the ids in step with `SKUS`: a product that exists here but not in the
catalogue is refused by the server, and vice versa.
