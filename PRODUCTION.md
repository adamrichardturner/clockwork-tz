# Production Deployment Guide

This document provides step-by-step instructions for deploying clockwork-tz to production.

## Table of Contents

1. [Cryptographic Key Generation](#cryptographic-key-generation)
2. [TZDB Data Pipeline](#tzdb-data-pipeline)
3. [CDN Infrastructure](#cdn-infrastructure)
4. [GitHub Actions Configuration](#github-actions-configuration)
5. [Testing](#testing)
6. [Deployment](#deployment)

## Cryptographic Key Generation

The package uses RSA-PSS with SHA-256 for signing timezone data. You need to generate a production key pair.

### Generate RSA Key Pair

```bash
# Generate 2048-bit RSA private key
openssl genpkey -algorithm RSA -pkcs8 -out clockwork-tz-private-2024.pem -pkeyopt rsa_keygen_bits:2048

# Extract public key from private key
openssl pkey -in clockwork-tz-private-2024.pem -pubout -out clockwork-tz-public-2024.pem

# View the public key
cat clockwork-tz-public-2024.pem
```

### Update Public Key in Code

1. Open `src/data/updater.ts`
2. Replace the `TZDB_PUBLIC_KEY_PEM` constant with your generated public key:

```typescript
const TZDB_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
[PASTE YOUR PUBLIC KEY HERE]
-----END PUBLIC KEY-----`
```

3. Commit the change (public key is safe to commit)

### Secure Private Key Storage

**NEVER COMMIT THE PRIVATE KEY TO GIT**

#### Option 1: GitHub Secrets (Recommended for CI/CD)

1. Go to your GitHub repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add a new repository secret:
   - Name: `TZDB_PRIVATE_KEY`
   - Value: Contents of `clockwork-tz-private-2024.pem`

#### Option 2: Cloud Key Management

For production systems, use a proper key management service:

- **AWS**: AWS Secrets Manager or AWS KMS
- **Azure**: Azure Key Vault
- **Google Cloud**: Google Cloud Secret Manager

#### Option 3: Environment Variable (Local Development)

```bash
export TZDB_PRIVATE_KEY="$(cat clockwork-tz-private-2024.pem)"
```

### Sign Data with Private Key

Create a signing script for manual signing:

```bash
#!/bin/bash
# scripts/sign-tzdb.sh

DATA_FILE="$1"
PRIVATE_KEY="${TZDB_PRIVATE_KEY_FILE:-clockwork-tz-private-2024.pem}"
OUTPUT_FILE="${DATA_FILE}.sig"

if [ ! -f "$DATA_FILE" ]; then
  echo "Error: Data file not found: $DATA_FILE"
  exit 1
fi

if [ ! -f "$PRIVATE_KEY" ]; then
  echo "Error: Private key not found: $PRIVATE_KEY"
  exit 1
fi

# Sign the data using RSA-PSS
openssl dgst -sha256 -sign "$PRIVATE_KEY" \
  -sigopt rsa_pss_saltlen:32 \
  -out "$OUTPUT_FILE" \
  "$DATA_FILE"

# Convert to base64 for JSON
base64 -i "$OUTPUT_FILE" > "${OUTPUT_FILE}.b64"

echo "Signature created: ${OUTPUT_FILE}.b64"
```

Make it executable:

```bash
chmod +x scripts/sign-tzdb.sh
```

## TZDB Data Pipeline

### Build TZDB JSON Data

The package includes a script to convert IANA timezone data to JSON format.

#### Build Latest Version

```bash
npm run build:tzdb
```

#### Build Specific Version

```bash
npm run build:tzdb 2024b
```

This script will:

1. Download the IANA timezone database
2. Parse zone, rule, and link files
3. Generate transition data for 2000-2100
4. Create a JSON file in `data/tzdb-{version}.json`
5. Generate a manifest file in `data/manifest.json`

### Current Limitations

The included converter is a **basic implementation** that:

- Generates simplified transitions
- Covers 2000-2100 date range
- May not handle all historical timezone changes accurately

For production use, you should:

1. Use the [moment-timezone data builder](https://github.com/moment/moment-timezone/tree/develop/data)
2. Use [timezonecomplete's data scripts](https://github.com/spiritix/timezonecomplete)
3. Develop a more comprehensive parser based on your accuracy requirements

### Recommended Production Parser

For a production-grade parser, consider using Node.js libraries:

- [zdump](https://github.com/eggert/tz) - Official IANA tool
- [moment-timezone-data-builder](https://www.npmjs.com/package/moment-timezone-data-builder)

## CDN Infrastructure

### Set Up CDN

Choose a CDN provider:

- **Cloudflare** (Recommended for global distribution)
- **AWS CloudFront** (Recommended for AWS integration)
- **Azure CDN**
- **Google Cloud CDN**

### CDN Configuration

#### CORS Headers

```nginx
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

#### Cache Headers

```nginx
# Manifest - short cache (1 hour)
Cache-Control: public, max-age=3600, must-revalidate

# Data files - long cache (7 days)
Cache-Control: public, max-age=604800, immutable
```

#### ETag Support

Enable ETags for efficient conditional requests.

### Upload Data to CDN

Example using AWS S3 + CloudFront:

```bash
# Upload data file
aws s3 cp data/tzdb-2024b.json s3://your-bucket/tzdb-2024b.json \
  --content-type application/json \
  --cache-control "public, max-age=604800, immutable"

# Upload manifest
aws s3 cp data/manifest.json s3://your-bucket/manifest.json \
  --content-type application/json \
  --cache-control "public, max-age=3600, must-revalidate"

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/manifest.json"
```

### Update manifest.json URLs

Update the `dataUrl` in `manifest.json` to point to your CDN:

```json
{
  "version": "2024b",
  "dataUrl": "https://cdn.yourdomain.com/tzdb-2024b.json",
  "signature": "base64_signature_here"
}
```

## GitHub Actions Configuration

### Update Workflow

Edit `.github/workflows/tzdb-update.yml`:

```yaml
- name: Build JSON data
  run: |
    npm run build:tzdb ${{ needs.check-tzdb-version.outputs.new_version }}

- name: Sign data
  env:
    TZDB_PRIVATE_KEY: ${{ secrets.TZDB_PRIVATE_KEY }}
  run: |
    # Write private key to file
    echo "$TZDB_PRIVATE_KEY" > private-key.pem
    chmod 600 private-key.pem
    
    # Sign the data
    ./scripts/sign-tzdb.sh data/tzdb-${{ needs.check-tzdb-version.outputs.new_version }}.json
    
    # Clean up private key
    rm private-key.pem

- name: Upload to CDN
  run: |
    VERSION="${{ needs.check-tzdb-version.outputs.new_version }}"
    
    # Upload data file
    aws s3 cp "data/tzdb-${VERSION}.json" \
      "s3://your-bucket/tzdb-${VERSION}.json" \
      --content-type application/json
    
    # Update manifest
    # ... (generate and upload manifest)
```

### Required Secrets

Add these secrets to your GitHub repository:

- `TZDB_PRIVATE_KEY` - The RSA private key for signing
- `AWS_ACCESS_KEY_ID` - AWS credentials for CDN upload (if using AWS)
- `AWS_SECRET_ACCESS_KEY` - AWS credentials for CDN upload (if using AWS)

## Testing

### Test with Sample Data

Create a test TZDB file for development:

```typescript
// test-data/sample-tzdb.json
{
  "version": "test-2024",
  "zones": {
    "UTC": {
      "name": "UTC",
      "transitions": [{
        "timestamp": 0,
        "rule": {
          "offsetMinutes": 0,
          "abbreviation": "UTC",
          "isDst": false
        },
        "type": "standard"
      }]
    },
    "America/New_York": {
      "name": "America/New_York",
      "transitions": [
        {
          "timestamp": 1704067200,
          "rule": {
            "offsetMinutes": -300,
            "abbreviation": "EST",
            "isDst": false
          },
          "type": "standard"
        }
      ]
    }
  },
  "rules": {},
  "links": {
    "US/Eastern": "America/New_York"
  },
  "metadata": {
    "buildTime": "2024-01-01T00:00:00Z",
    "dataHash": "test-hash",
    "dateRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2025-01-01T00:00:00Z"
    },
    "zoneCount": 2,
    "ruleCount": 0
  }
}
```

### Test Embedded Engine

```typescript
import { initClockworkTZ, fromUTC } from 'clockwork-tz'
import sampleData from './test-data/sample-tzdb.json'

// Initialize with embedded engine
initClockworkTZ({
  engine: 'embedded-tzdb',
})

// Load sample data
await getCurrentEngine().loadTzdbData(sampleData, 'test-2024')

// Test conversion
const result = fromUTC(new Date(), 'America/New_York')
console.log(result)
```

## Deployment

### Version Bump Strategy

For production releases:

```bash
# Beta release (80% complete)
npm version 1.0.0-beta.1
npm publish --tag beta

# Release candidate (fully tested)
npm version 1.0.0-rc.1
npm publish --tag rc

# Stable release
npm version 1.0.0
npm publish
```

### Pre-Release Checklist

- [ ] Generate and secure production RSA key pair
- [ ] Update public key in `src/data/updater.ts`
- [ ] Build and test TZDB data with real IANA database
- [ ] Set up CDN infrastructure
- [ ] Configure GitHub Actions with secrets
- [ ] Test data signing and verification
- [ ] Run full test suite
- [ ] Test in Node.js and browser environments
- [ ] Update documentation
- [ ] Verify signature verification works with production key

### Monitoring

Set up monitoring for:

- **CDN Health**: Monitor data availability and response times
- **Update Success Rate**: Track successful TZDB updates
- **Signature Verification**: Log verification failures
- **Usage Metrics**: Track API usage and performance
- **Error Rates**: Monitor timezone conversion errors

### Security Best Practices

1. **Key Rotation**: Plan to rotate keys annually
2. **Backup Keys**: Store encrypted backups of private keys
3. **Access Control**: Limit access to private keys
4. **Audit Logs**: Log all signing operations
5. **Signature Verification**: Always verify signatures in production

## Support

For questions or issues:

- GitHub Issues: https://github.com/adamrichardturner/clockwork-tz/issues
- Email: support@your-domain.com

## License

MIT License - See LICENSE file for details
