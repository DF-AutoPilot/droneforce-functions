/**
 * This script derives a Solana private key from a mnemonic phrase
 * Run with: node derive-key.js
 * It will prompt for your mnemonic phrase
 */
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const readline = require('readline');
const bip39 = require('bip39');
const ed25519 = require('@noble/ed25519');

// Create a readline interface for secure input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function deriveKeypairFromMnemonic(mnemonic) {
  // Generate seed from mnemonic
  const seed = await bip39.mnemonicToSeed(mnemonic);
  
  // Get the ed25519 private key from the seed (first 32 bytes)
  const privateKey = seed.slice(0, 32);
  
  // Create a Solana keypair from private key
  const keypair = Keypair.fromSeed(privateKey);
  
  return keypair;
}

// Main function
async function main() {
  // Prompt for mnemonic
  rl.question('Enter your mnemonic/recovery phrase (space-separated words): ', async (mnemonic) => {
    try {
      // Validate mnemonic
      if (!bip39.validateMnemonic(mnemonic)) {
        console.error('Error: Invalid mnemonic phrase');
        rl.close();
        return;
      }
      
      const keypair = await deriveKeypairFromMnemonic(mnemonic);
      
      console.log('\n========= WALLET INFORMATION =========');
      console.log(`Public Key: ${keypair.publicKey.toString()}`);
      console.log(`Private Key (base58): ${bs58.encode(keypair.secretKey)}`);
      console.log('======================================\n');
      console.log('⚠️ SECURITY WARNING: Store this private key securely and never share it with anyone.');
      console.log('For Firebase Functions config, use:');
      console.log(`firebase functions:config:set validator.privatekey="${bs58.encode(keypair.secretKey)}"`);
      
    } catch (error) {
      console.error('Error deriving keypair:', error);
    } finally {
      rl.close();
    }
  });
}

// Run the script
main();
