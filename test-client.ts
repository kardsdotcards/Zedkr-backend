/**
 * x402 Test Client
 * 
 * This script demonstrates how to make paid requests to ZedKr monetized APIs.
 * It handles the full x402 payment flow:
 * 1. Make initial request (gets 402 Payment Required)
 * 2. Sign payment payload with Stacks wallet
 * 3. Resubmit request with payment-signature header
 * 4. Receive API response
 */

import 'dotenv/config';
import axios from 'axios';
import { 
  wrapAxiosWithPayment, 
  privateKeyToAccount,
  decodePaymentResponse,
  getExplorerURL 
} from 'x402-stacks';

const NETWORK = (process.env.NETWORK as 'mainnet' | 'testnet') || 'testnet';
const API_URL = process.env.API_URL || 'https://zedkr.up.railway.app';

// Load or generate wallet
let account;
if (process.env.CLIENT_PRIVATE_KEY) {
  account = privateKeyToAccount(process.env.CLIENT_PRIVATE_KEY, NETWORK);
  console.log('✅ Using wallet:', account.address);
} else {
  console.error('❌ Missing CLIENT_PRIVATE_KEY in .env file');
  console.log('\nTo use this client:');
  console.log('1. Add your private key to .env: CLIENT_PRIVATE_KEY=your_private_key_here');
  console.log('2. Make sure your wallet has STX balance on', NETWORK);
  process.exit(1);
}

// Create axios instance with automatic x402 payment handling
const api = wrapAxiosWithPayment(
  axios.create({
    baseURL: API_URL,
    timeout: 60000,
  }),
  account
);

/**
 * Make a paid request to a monetized API endpoint
 */
async function makePaidRequest(endpointPath: string) {
  try {
    console.log(`\n📡 Making request to: ${API_URL}${endpointPath}`);
    console.log('💳 Payment will be handled automatically via x402 protocol...\n');

    // Make the request - x402-stacks handles payment automatically
    const response = await api.get(endpointPath);

    console.log('✅ Request successful!');
    console.log('📦 Response data:', JSON.stringify(response.data, null, 2));

    // Decode payment response from headers (V2 uses base64-encoded 'payment-response')
    const paymentResponse = decodePaymentResponse(response.headers['payment-response']);
    if (paymentResponse) {
      console.log('\n💰 Payment Details:');
      console.log('   Transaction:', paymentResponse.transaction);
      console.log('   Payer:', paymentResponse.payer);
      console.log('   Network:', paymentResponse.network);
      console.log('   Explorer:', getExplorerURL(paymentResponse.transaction, NETWORK));
    }

    return response;
  } catch (error: any) {
    if (error.response) {
      console.error('❌ Request failed:', error.response.status, error.response.statusText);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
      
      // If it's a 402, show payment instructions
      if (error.response.status === 402) {
        console.log('\n💡 This endpoint requires payment. The x402-stacks library should handle this automatically.');
        console.log('   Make sure your wallet has sufficient STX balance.');
      }
    } else {
      console.error('❌ Error:', error.message);
    }
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  // Get endpoint path from command line or use default
  const endpointPath = process.argv[2] || '/teckdegen/teck/teck';
  
  console.log('🚀 ZedKr x402 Test Client');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Network: ${NETWORK}`);
  console.log(`API URL: ${API_URL}`);
  console.log(`Wallet: ${account.address}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    await makePaidRequest(endpointPath);
  } catch (error) {
    console.error('\n❌ Failed to complete request');
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { makePaidRequest, api };

