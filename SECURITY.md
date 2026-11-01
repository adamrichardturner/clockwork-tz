# Security

## Reporting a vulnerability

Please email hello@adamrichardturner.dev rather than opening a public issue. You'll get a
reply within a few days.

## Timezone data signing

The `embedded-tzdb` engine can fetch tzdb updates at runtime. Each release of the
`clockwork-tz-data` package contains:

- `tzdb.json`: the compiled data
- `manifest.json`: `{ version, releaseDate, dataUrl, sha256, signature, keyId }`

`signature` is an Ed25519 signature over the UTF-8 bytes of `${version}\n${sha256}`, where
`sha256` is the lowercase hex SHA-256 of `tzdb.json`. The library verifies it with WebCrypto
against `DEFAULT_PUBLIC_KEY` (raw key, base64):

```
DLvL/miUAfXKI8Sae27IuV/o5l3vbg5OIp5QMkeXLkU=
```

Data is rejected, and the current data kept, when:

- the signature does not verify, or WebCrypto/Ed25519 is unavailable
- the downloaded bytes do not match `sha256`
- the version is not newer than the loaded data (no downgrades)

### Key handling

- The private key is stored only as the `TZDB_SIGNING_KEY` GitHub Actions secret (PEM, PKCS#8)
  and is used by `scripts/sign-tzdb.ts` in the TZDB Update workflow.
- To rotate it:
  1. Generate a new key.
  2. Update `DEFAULT_PUBLIC_KEY` in `src/data/updater.ts` and this file.
  3. Release the library.
  4. Replace the secret.

  Clients on older versions keep verifying against the old key until they upgrade, so keep
  the old secret until you're ready to stop serving them updates.

- If you self-host data, sign it with your own key and pass `publicKey` to `initClockworkTZ`.
