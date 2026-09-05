# Changelog

## Unreleased

- Port the author byline and inline smiley logo from the private build (avatar embedded as base64, no extra request).
- Restore the "single output format" guard in `createConvertedRelay`, dropped when the maintainer relay was made optional.
- Fix a `ReferenceError` in `createRelay`: the button-state line was lost during relay sanitization while its `finally` block still referenced it.
- Add local node filtering and export of the filtered subscription.
- Add reuse-based deduplication with protocol and address/port grouping.
- Fix stale URL results and keep the public build unbound to any maintainer relay.
- Replace the unavailable `GEOSITE,proxy` rule with `geolocation-!cn` and pin the GeoSite download URL.
- Fix invalid `+*.` fake-IP filter entries and add regression coverage.
- Document that local filtering is not uploaded to or persisted by relay links.
- Improve documentation for self-hosting, architecture, security, and contributions.

## 1.0.0 — 2026-08-31

- Initial public release.
- Browser UI supports multiple subscription input and output formats.
- Added node-name annotations, duplicate detection, and local QR generation.
- Included CLI converter and optional self-hosted relay service.
- Added MIT license and security policy.
