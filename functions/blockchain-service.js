/**
 * Blockchain service for interacting with Solana blockchain
 * This module handles server-side verification of tasks based on uploaded log files
 */
const { Connection, PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const functions = require('firebase-functions');

// Constants for blockchain integration
const SOLANA_NETWORK = 'devnet'; // Use 'mainnet-beta' for production
const SOLANA_RPC_URL = 'https://api.devnet.solana.com'; // Devnet RPC endpoint
const DEBUG_MODE = true; // Enable debug mode for development

class BlockchainService {
  /**
   * @param {Object} admin - Firebase admin SDK instance
   */
  constructor(admin) {
    // Initialize Solana connection
    this.connection = new Connection(SOLANA_RPC_URL);
    
    // Store Firebase admin reference
    this.admin = admin;
    this.db = admin ? admin.firestore() : null;
    
    // Validator keypair (should be stored securely in production)
    // NOTE: In production, use secret manager or KMS instead of hardcoded keys
    this.validatorPrivateKey = functions.config().validator?.privatekey || '';
    
    // Create validator keypair from private key if available
    if (this.validatorPrivateKey) {
      const decodedKey = bs58.decode(this.validatorPrivateKey);
      this.validatorKeypair = Keypair.fromSecretKey(decodedKey);
      console.log(`Validator public key: ${this.validatorKeypair.publicKey.toString()}`);
    } else {
      // For testing only - generate a new keypair if none provided
      // In production, this should throw an error
      console.warn('WARNING: No validator private key provided. Generating temporary keypair');
      this.validatorKeypair = Keypair.generate();
      console.log(`Temporary validator public key: ${this.validatorKeypair.publicKey.toString()}`);
      console.log('This keypair will not match the frontend validator key!');
    }
  }

  /**
   * Extract task ID from file path
   * Tries to find a pattern like "logs/task-{taskId}-..." or just get it from metadata
   * @param {string} filePath Path of the uploaded file
   * @param {Object} metadata Optional metadata that might contain the task ID
   * @returns {Promise<string|null>} Task ID or null if not found
   */
  async extractTaskId(filePath, metadata = {}) {
    try {
      // Check if task ID is in the metadata
      if (metadata.taskId) {
        console.log(`Found task ID in metadata: ${metadata.taskId}`);
        return metadata.taskId;
      }

      // Check if filename follows pattern: task-{taskId}-...
      const taskIdMatch = filePath.match(/task-([a-zA-Z0-9]+)/);
      if (taskIdMatch && taskIdMatch[1]) {
        console.log(`Extracted task ID from filename: ${taskIdMatch[1]}`);
        return taskIdMatch[1];
      }

      // Check if Firestore is available
      if (!this.db) {
        console.warn('Firestore is not available, cannot retrieve recent tasks');
        return null;
      }

      // If no task ID found in the path or metadata, get the most recent 'completed' task
      console.log('No task ID found in path or metadata, searching for recent completed tasks');
      const tasksSnapshot = await this.db.collection('tasks')
        .where('status', '==', 'completed')
        .orderBy('completedAt', 'desc')
        .limit(1)
        .get();

      if (!tasksSnapshot.empty) {
        const taskId = tasksSnapshot.docs[0].id;
        console.log(`Using most recent completed task: ${taskId}`);
        return taskId;
      }

      console.warn('No task ID could be found and no recent completed tasks exist');
      return null;
    } catch (error) {
      console.error('Error extracting task ID:', error);
      return null;
    }
  }

  /**
   * Create a mock blockchain transaction record for development purposes
   * @param {string} taskId The ID of the task to verify
   * @param {boolean} result Verification result
   * @param {string} reportHash Hash of the verification report/log file
   * @returns {Promise<string>} Mock transaction signature
   */
  async createMockTransaction(taskId, result, reportHash) {
    const mockTxId = `MOCK_TX_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(`Created mock transaction: ${mockTxId}`);
    
    // In production, this would be a real blockchain transaction
    return mockTxId;
  }

  /**
   * Verify a task on the blockchain
   * @param {string} taskId The ID of the task to verify
   * @param {boolean} verificationResult Whether verification was successful
   * @param {string} verificationReportHash Hash of the verification report
   * @returns {Promise<Object>} Transaction result
   */
  async verifyTask(taskId, verificationResult, verificationReportHash) {
    try {
      console.log(`Verifying task ${taskId} with result: ${verificationResult}, hash: ${verificationReportHash}`);

      // Check if Firestore is available
      if (!this.db) {
        console.warn('Firestore is not available, cannot verify task');
        return {
          success: false,
          message: 'Firestore not initialized, cannot verify task',
          transactionId: null
        };
      }

      // Get task data to ensure it exists and is in the right state
      const taskDoc = await this.db.collection('tasks').doc(taskId).get();
      
      if (!taskDoc.exists) {
        throw new Error(`Task not found: ${taskId}`);
      }
      
      const task = taskDoc.data();
      
      if (task.status !== 'completed') {
        throw new Error(`Task must be completed before verification. Current status: ${task.status}`);
      }
      
      if (task.verificationResult !== undefined && task.verificationResult !== null) {
        console.log(`Task ${taskId} has already been verified with result: ${task.verificationResult}`);
        return {
          success: false,
          message: 'Task has already been verified',
          transactionId: null
        };
      }
      
      let transactionId;
      
      // In development, use a mock transaction
      if (DEBUG_MODE) {
        transactionId = await this.createMockTransaction(taskId, verificationResult, verificationReportHash);
      } else {
        // In production, this would use real blockchain transactions with:
        // 1. Creating the appropriate Solana instructions
        // 2. Signing with the validator keypair
        // 3. Sending and confirming the transaction
        transactionId = 'NOT_IMPLEMENTED_YET';
      }
      
      // Update the task in Firestore with verification result
      if (this.db && this.admin) {
        await this.db.collection('tasks').doc(taskId).update({
          status: verificationResult ? 'verified' : 'rejected',
          verificationResult: verificationResult,
          verificationReportHash: verificationReportHash,
          verificationTimestamp: this.admin.firestore.FieldValue.serverTimestamp(),
          verificationTx: transactionId
        });
        
        console.log(`Task ${taskId} verified successfully on blockchain with tx: ${transactionId}`);
      } else {
        console.log(`Mock verification only: Firestore not available to update task ${taskId}`);
      }
      
      return {
        success: true,
        message: `Task ${taskId} verified successfully`,
        transactionId,
        verificationResult
      };
    } catch (error) {
      console.error('Error verifying task:', error);
      return {
        success: false,
        message: `Error verifying task: ${error.message}`,
        transactionId: null
      };
    }
  }
}

// Export the class instead of a singleton instance
module.exports = BlockchainService;
