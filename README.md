# Metro Lishi Lookup

Metro automotive locksmith lookup and reference tool.

## Reference Hub v2

The core Lishi/YMM database remains the primary lookup layer. Imported KeyForge datasets are supporting evidence and never silently overwrite a core recommendation.

Imported datasets:
- Lishi master reference: 259 tools / 1,122 applications
- Master parts catalog: 1,679 cross-reference rows
- Metro/KeyForge VIN history: 177 unique VIN records
- Public reference/source metadata

The Reference tab supports reverse lookup by Lishi/tool alias, FCC ID, OEM part number, and catalog cross-reference.

Vehicle results can show exact master-reference applications and exact-YMM shop-history evidence. Family guidance and exact records are labeled separately.

### Accuracy rule

No match is not proof of incompatibility. Family matches are not exact fitment. FCC ID alone does not prove the complete key. Verify exact YMM, blade/keyway, FCC/frequency, board/chip, button layout, security architecture, and current programmer coverage before production use.


## Secure live Metro VIN history

Detailed VIN/job history is intentionally **not shipped in the public static data bundle**. The secure Node service searches only these six allowlisted Omaha work calendars: Tim, Larry, Noah, Kurt, Gage, and Jason.

Required server-only environment variables:

- `METRO_HISTORY_PASSWORD` — shared staff password for private job history; never place it in client code.
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN` — Google OAuth credential with read access to the six calendars.

The browser submits only a VIN to `/api/vin-history` after server authentication. The server obtains the Google access token, searches the allowlisted calendars, sanitizes matching events, and returns only those exact-VIN job records. Sessions use an 8-hour `HttpOnly; Secure; SameSite=Strict` cookie. API responses use `Cache-Control: no-store`.

The existing Render Static Site cannot securely hold Google OAuth secrets. `render.yaml` defines the replacement Node web service. Configure the four secrets in Render before using live history. Do not commit their values.
