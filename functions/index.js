const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const BlockchainService = require('./blockchain-service');

// Initialize Firebase Admin SDK
admin.initializeApp();

// Initialize blockchain service with admin SDK
const blockchainService = new BlockchainService(admin);

/**
 * Function that sends file hash to blockchain for verification
 * This will automatically verify the task in the blockchain
 * @param {string} fileHash - The calculated hash of the file
 * @param {string} filePath - The path to the file in storage
 * @param {Object} metadata - Additional metadata about the file
 * @return {Promise<Object>} Verification result
 */
async function sendToExternalSystem(fileHash, filePath, metadata = {}) {
  console.log(`Sending file hash ${fileHash} for file at ${filePath} to blockchain verification`);
  
  try {
    // Extract task ID from file path or metadata
    const taskId = await blockchainService.extractTaskId(filePath, metadata);
    
    if (!taskId) {
      console.warn(`Could not determine task ID for file ${filePath}`);
      return {
        success: false,
        message: 'Could not determine task ID for verification',
        transactionId: null
      };
    }
    
    console.log(`Proceeding with verification for task ${taskId}`);
    
    // Always verify as successful for this proof of concept
    // In a production system, you would implement actual verification logic
    const verificationResult = true;
    
    // Call blockchain service to verify the task
    const result = await blockchainService.verifyTask(
      taskId,
      verificationResult,
      fileHash
    );
    
    return result;
  } catch (error) {
    console.error('Error in sendToExternalSystem:', error);
    return {
      success: false,
      message: `Error during verification: ${error.message}`,
      transactionId: null
    };
  }
}

/**
 * Cloud Function that triggers when a file is uploaded to the logs/ directory
 * in Firebase Storage. It calculates a SHA-256 hash of the file and stores
 * metadata in Firestore.
 */
exports.processLogFileUpload = functions.storage.bucket('df-autopilot.firebasestorage.app').object()
  .onFinalize(async (object) => {
    // Check if this is a file in the logs/ path
    if (!object.name.startsWith('logs/')) {
      console.log(`File ${object.name} is not in logs/ directory. Skipping.`);
      return null;
    }

    console.log(`Processing uploaded file: ${object.name}`);
    
    // File details
    const fileBucket = object.bucket;
    const filePath = object.name;
    const contentType = object.contentType;
    const fileName = path.basename(filePath);
    const fileSize = object.size;
    const timestamp = object.timeCreated;
    
    try {
      // Create a temporary file path
      const tempFilePath = path.join(os.tmpdir(), fileName);
      console.log(`Created temp file path: ${tempFilePath}`);
      
      // Download file from bucket
      const bucket = admin.storage().bucket(fileBucket);
      const file = bucket.file(filePath);
      
      console.log(`Downloading file to temp location...`);
      await file.download({destination: tempFilePath});
      console.log(`File downloaded to: ${tempFilePath}`);
      
      // Calculate hash
      console.log(`Calculating SHA-256 hash...`);
      const fileBuffer = fs.readFileSync(tempFilePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      const fileHash = hashSum.digest('hex');
      console.log(`File hash: ${fileHash}`);
      
      // Store metadata and hash in Firestore
      console.log(`Storing metadata in Firestore...`);
      const fileMetadata = {
        fileName: fileName,
        filePath: filePath,
        contentType: contentType,
        sizeBytes: fileSize,
        uploadTimestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
        sha256Hash: fileHash,
        processedTimestamp: admin.firestore.Timestamp.now()
      };
      
      await admin.firestore().collection('file_hashes').add(fileMetadata);
      console.log(`Metadata stored in Firestore collection 'file_hashes'`);
      
      // Add the hash as metadata to the storage file object
      console.log(`Adding hash as metadata to storage object...`);
      await file.setMetadata({
        metadata: {
          sha256Hash: fileHash
        }
      });
      console.log(`Hash metadata added to storage object`);
      
      // Send to blockchain for automated verification
      console.log(`Sending file hash to blockchain verification system...`);
      const verificationResult = await sendToExternalSystem(fileHash, filePath, {
        fileName: fileName,
        fileSize: fileSize,
        uploadTimestamp: timestamp
      });
      
      if (verificationResult.success) {
        console.log(`Blockchain verification successful: ${verificationResult.message}`);
        console.log(`Transaction ID: ${verificationResult.transactionId}`);
      } else {
        console.warn(`Blockchain verification issue: ${verificationResult.message}`);
      }
      
      // Cleanup temp file
      console.log(`Cleaning up temporary files...`);
      fs.unlinkSync(tempFilePath);
      console.log(`Temporary file removed: ${tempFilePath}`);
      
      return fileHash;
    } catch (error) {
      console.error('Error processing file:', error);
      // Ensure temp file is cleaned up even if there's an error
      try {
        const tempFilePath = path.join(os.tmpdir(), fileName);
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log(`Cleaned up temporary file after error: ${tempFilePath}`);
        }
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
      throw error;
    }
  });
