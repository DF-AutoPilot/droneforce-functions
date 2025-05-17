# DroneForce Functions

Firebase Cloud Functions for processing drone log files uploaded to Firebase Storage with automated blockchain verification.

## Overview

This project contains a Firebase Cloud Function that triggers when log files are uploaded to the Firebase Storage bucket. The function:

1. Downloads the uploaded file temporarily
2. Calculates a SHA-256 hash of the file
3. Stores metadata and the hash in Firestore
4. Adds the hash as metadata to the storage file
5. Automatically verifies the associated task in the blockchain
6. Updates the task status in Firestore based on verification

## Prerequisites

- Node.js 18 or later
- Firebase CLI tools
- Firebase project with Storage and Firestore enabled
- Service account JSON file for authentication

## Installation

1. Install dependencies:
```
cd functions
npm install
```

2. Deploy the function:
```
firebase deploy --only functions
```

## Function Details

The main function `processLogFileUpload` is triggered when files are uploaded to the 'logs/' path in Firebase Storage. It performs hash calculation and metadata storage as requested.

The `sendToExternalSystem` function now automatically handles blockchain verification:
1. Extracts the task ID from the file path or uses the most recent completed task
2. Calls the blockchain service to verify the task
3. Updates the task status in Firestore based on verification results

The `blockchain-service.js` module provides server-side blockchain integration, handling task verification without requiring frontend interaction.

## Deployment with Blockchain Integration

### 1. Configure Validator Private Key

First, set up the validator private key configuration for Firebase Functions:

```bash
firebase functions:config:set validator.privatekey="YOUR_VALIDATOR_PRIVATE_KEY_IN_BASE58"
```

To get your validator's private key in Base58 format for testing purposes (be very careful with this in production):

```javascript
// In a Node.js environment with @solana/web3.js and bs58 installed
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// Generate a keypair (for testing only)
const keypair = Keypair.generate();

// Get the private key in base58 format
const privateKeyBase58 = bs58.encode(keypair.secretKey);
console.log('Validator public key:', keypair.publicKey.toString());
console.log('Private key (base58):', privateKeyBase58);
```

Make sure this validator key matches the one expected by your frontend application (should match the `NEXT_PUBLIC_VALIDATOR_PUBKEY` in your frontend).

## Project Structure

- `functions/index.js` - Main implementation of the Cloud Functions
- `functions/package.json` - NPM dependencies and scripts
- `.firebaserc` - Firebase project configuration

## Security Note

Ensure your service account JSON file is properly secured and not committed to any public repositories.
