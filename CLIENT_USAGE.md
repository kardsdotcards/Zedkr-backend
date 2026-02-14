# x402 Test Client Usage

This guide shows you how to use the x402 test client to make paid requests to your monetized APIs.

## Setup

1. **Install dependencies** (if not already installed):
   ```bash
   npm install
   ```

2. **Create a `.env` file** in the `backend` directory:
   ```env
   NETWORK=testnet
   API_URL=https://zedkr.up.railway.app
   CLIENT_PRIVATE_KEY=your_private_key_here
   ```

3. **Get your private key** from your Stacks wallet:
   - For **Hiro Wallet**: Settings → Show Secret Key
   - For **Xverse**: Settings → Export Private Key
   - Make sure you're using the **testnet** private key if `NETWORK=testnet`

4. **Fund your wallet** with STX on testnet:
   - Get testnet STX from: https://explorer.stacks.co/sandbox/faucet
   - Or use: https://stxfaucet.com/

## Usage

### Basic Usage

Make a request to a monetized endpoint:

```bash
npm run test-client /teckdegen/teck/teck
```

Or use the default endpoint:

```bash
npm run test-client
```

### How It Works

The test client uses the `x402-stacks` library which automatically:

1. **Makes initial request** → Gets `402 Payment Required` response
2. **Reads payment instructions** → Extracts amount, payTo, network from response
3. **Signs payment payload** → Uses your private key to sign the payment
4. **Resubmits with payment** → Includes `payment-signature` header
5. **Receives API response** → After payment verification, gets the actual API data

### Example Output

```
🚀 ZedKr x402 Test Client
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Network: testnet
API URL: https://zedkr.up.railway.app
Wallet: ST1ABC123...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 Making request to: https://zedkr.up.railway.app/teckdegen/teck/teck
💳 Payment will be handled automatically via x402 protocol...

✅ Request successful!
📦 Response data: { ... }

💰 Payment Details:
   Transaction: 0x1234...
   Payer: ST1ABC123...
   Network: stacks:2147483648
   Explorer: https://explorer.stacks.co/txid/0x1234...
```

## Important Notes

- **Private Key Security**: Never commit your `.env` file or private key to version control
- **Network Matching**: Make sure your `NETWORK` matches the network your API is deployed on
- **STX Balance**: Ensure your wallet has sufficient STX to pay for the API call
- **Testnet vs Mainnet**: Use testnet for testing, mainnet for production

## Troubleshooting

### Error: "Insufficient balance"
- Make sure your wallet has enough STX
- Check that you're using the correct network (testnet/mainnet)

### Error: "Payment verification failed"
- Verify your private key is correct
- Check that the facilitator URL is accessible
- Ensure the API endpoint is properly configured

### Error: "Endpoint not found"
- Verify the endpoint path is correct: `/username/apiName/endpointPath`
- Check that the endpoint is active in your dashboard

## Using in Your Own Code

You can import and use the client in your own code:

```typescript
import { makePaidRequest } from './test-client';

// Make a paid request
const response = await makePaidRequest('/username/api/endpoint');
console.log(response.data);
```

Or use the wrapped axios instance directly:

```typescript
import { api } from './test-client';

const response = await api.get('/username/api/endpoint');
```

