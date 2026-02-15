import express from 'express';
import { paymentMiddleware, getPayment, STXtoMicroSTX, privateKeyToAccount, signPaymentPayload, wrapAxiosWithPayment } from 'x402-stacks';
import { supabase } from '../config/supabase.js';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { updateMonetizedUrlForEndpoint } from '../utils/updateMonetizedUrls.js';

const router = express.Router();

/**
 * Dynamic proxy routing: /:username/:apiName/*
 * This handles all monetized API calls
 */
router.all('/:username/:apiName/*', async (req, res, next) => {
  try {
    const { username, apiName } = req.params;
    const endpointPath = (req.params as any)[0]; // The wildcard path after apiName

    // Resolve endpoint from database
    const { data: endpointData, error } = await supabase
      .from('endpoints')
      .select(`
        id,
        endpoint_path,
        original_url,
        price_microstx,
        active,
        apis!inner (
          id,
          api_name_slug,
          users!inner (
            username,
            wallet_address
          )
        )
      `)
      .eq('apis.users.username', username)
      .eq('apis.api_name_slug', apiName)
      .eq('endpoint_path', endpointPath)
      .eq('active', true)
      .single();

    if (error || !endpointData) {
      return res.status(404).json({
        success: false,
        error: 'Endpoint not found',
      });
    }

    const endpoint = endpointData as any;
    const developerWallet = endpoint.apis.users.wallet_address;

    // Update monetized URL if it doesn't exist (backend ensures URL is set)
    if (!endpoint.monetized_url) {
      await updateMonetizedUrlForEndpoint(endpoint.id);
    }

    // Attach endpoint config to request for payment middleware
    (req as any).endpointConfig = {
      id: endpoint.id,
      price_microstx: endpoint.price_microstx,
      developer_wallet: developerWallet,
      original_url: endpoint.original_url,
    };

    // Check if private key is provided (for direct payment without wallet connect)
    const privateKey = req.query.privateKey as string || req.headers['x-private-key'] as string;
    
    if (privateKey) {
      // Direct payment mode: use private key to auto-sign payment
      return handleDirectPayment(req, res, endpoint, privateKey);
    }

    // Normal mode: use payment middleware (requires wallet connect)
    const network = (process.env.NETWORK || 'testnet') as 'mainnet' | 'testnet';
    const facilitatorUrl = process.env.FACILITATOR_URL || 'https://facilitator.stacksx402.com';

    // Convert microSTX to STX for human-readable display
    const priceSTX = (parseInt(endpoint.price_microstx) / 1000000).toFixed(6).replace(/\.?0+$/, '');

    // Create payment middleware instance
    // Include description for better x402scan compatibility
    const paymentMw = paymentMiddleware({
      amount: endpoint.price_microstx.toString(),
      payTo: developerWallet,
      network: network,
      facilitatorUrl: facilitatorUrl,
      description: `${endpoint.endpoint_name || 'API endpoint'} - ${endpoint.apis?.api_name || 'ZedKr API'}`,
    });

    // Wrap the response to add human-readable STX amount to 402 responses
    const originalJson = res.json.bind(res);
    res.json = function(body: any) {
      // If this is a 402 response, add amountSTX field to each accepts entry
      if (res.statusCode === 402 && body && body.accepts && Array.isArray(body.accepts)) {
        body.accepts = body.accepts.map((accept: any) => ({
          ...accept,
          amountSTX: priceSTX, // Add human-readable STX amount
        }));
      }
      return originalJson(body);
    };

    // Execute payment middleware, then proxy
    paymentMw(req, res, () => {
      // Payment verified - proceed to proxy
      handleProxiedRequest(req, res, endpoint);
    });
  } catch (error: any) {
    console.error('Proxy routing error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * Handle direct payment with private key (auto-sign payment)
 * This implements the x402 flow: get 402 -> sign -> retry -> proxy
 */
async function handleDirectPayment(req: express.Request, res: express.Response, endpoint: any, privateKey: string) {
  try {
    const network = (process.env.NETWORK || 'testnet') as 'mainnet' | 'testnet';
    const facilitatorUrl = process.env.FACILITATOR_URL || 'https://facilitator.stacksx402.com';
    const endpointConfig = (req as any).endpointConfig;

    // Create account from private key
    const account = privateKeyToAccount(privateKey, network);
    const payerAddress = account.address;

    // Step 1: Make initial request to get 402 payment required
    // We need to make an internal request to ourselves to get the 402 response
    const axios = require('axios');
    const baseUrl = process.env.ZEDKR_DOMAIN || 'https://zedkr.up.railway.app';
    const requestPath = req.originalUrl.split('?')[0]; // Remove query params for internal request
    
    let paymentResponse;
    try {
      // Make request without payment signature to get 402
      const initialResponse = await axios.get(`${baseUrl}${requestPath}`, {
        validateStatus: () => true, // Don't throw on 402
        headers: {
          ...req.headers,
          'payment-signature': undefined, // Remove if present
        },
      });

      if (initialResponse.status !== 402) {
        // No payment required, proxy directly
        return handleProxiedRequest(req, res, endpoint);
      }

      paymentResponse = initialResponse.data;
    } catch (error: any) {
      if (error.response?.status === 402) {
        paymentResponse = error.response.data;
      } else {
        throw error;
      }
    }

    // Step 2: Parse payment details from 402 response
    if (!paymentResponse || !paymentResponse.accepts || !paymentResponse.accepts[0]) {
      return res.status(402).json(paymentResponse);
    }

    const paymentInfo = paymentResponse.accepts[0];
    const amount = paymentInfo.amount || paymentInfo.amountMicroSTX;
    const payTo = paymentInfo.payTo || paymentInfo.payto;

    // Step 3: Create and sign payment payload
    const paymentPayload = {
      amount: amount,
      payTo: payTo,
      network: network,
      facilitatorUrl: facilitatorUrl,
    };

    // Sign payment payload using x402-stacks
    const paymentSignature = await signPaymentPayload(paymentPayload, account);

    // Step 4: Retry request with payment signature
    const axiosWithPayment = wrapAxiosWithPayment(
      axios.create({
        baseURL: baseUrl,
        timeout: 60000,
      }),
      account
    );

    // Make the paid request
    const paidResponse = await axiosWithPayment.get(requestPath);

    // Step 5: Proxy the successful response
    // Get payment details from response headers
    const payment = getPayment({ headers: paidResponse.headers } as any) || {
      payer: payerAddress,
      transaction: '',
      network: network,
    };

    // Attach payment to request for logging
    (req as any).payment = payment;

    // Now proxy to the original API
    handleProxiedRequest(req, res, endpoint);
  } catch (error: any) {
    console.error('Direct payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process payment with private key: ' + error.message,
    });
  }
}

/**
 * Handle proxied request after payment verification
 */
async function handleProxiedRequest(req: express.Request, res: express.Response, endpoint: any) {
  try {
    const payment = getPayment(req);
    const endpointConfig = (req as any).endpointConfig;

    // Log the API call
    if (payment) {
      await supabase.from('api_calls').insert({
        endpoint_id: endpointConfig.id,
        caller_wallet: payment.payer,
        tx_hash: payment.transaction,
        amount_paid: endpointConfig.price_microstx,
        status_code: null, // Will be updated after proxy
        latency_ms: null, // Will be updated after proxy
      });
    }

    // Create proxy middleware for this specific request
    const startTime = Date.now();
    const targetUrl = endpointConfig.original_url;

    // Parse target URL
    let targetUrlObj: URL;
    try {
      targetUrlObj = new URL(targetUrl);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid target URL',
      });
    }

    // Create proxy
    const proxy = createProxyMiddleware({
      target: `${targetUrlObj.protocol}//${targetUrlObj.host}`,
      changeOrigin: true,
      pathRewrite: {
        [`^/.*`]: targetUrlObj.pathname + (targetUrlObj.search || ''), // Use original path
      },
      onProxyReq: (proxyReq, req, res) => {
        // Forward original headers (except host)
        Object.keys(req.headers).forEach((key) => {
          if (key.toLowerCase() !== 'host') {
            const value = req.headers[key];
            if (value) {
              proxyReq.setHeader(key, value as string);
            }
          }
        });

        // Forward body for POST/PUT/PATCH
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      onProxyRes: async (proxyRes, req, res) => {
        const latency = Date.now() - startTime;

        // Add payment response header if payment was made (before response is sent)
        // Check if headers haven't been sent yet
        if (payment && !res.headersSent) {
          try {
            const paymentResponse = {
              success: true,
              transaction: payment.transaction,
              payer: payment.payer,
              network: payment.network,
            };
            res.setHeader('payment-response', Buffer.from(JSON.stringify(paymentResponse)).toString('base64'));
          } catch (error) {
            // Headers already sent, ignore
            console.warn('Could not set payment-response header:', error);
          }
        }

        // Update API call log with status and latency (async, don't block response)
        if (payment) {
          // Don't await - run in background to avoid blocking response
          supabase
            .from('api_calls')
            .update({
              status_code: proxyRes.statusCode,
              latency_ms: latency,
            })
            .eq('tx_hash', payment.transaction)
            .catch((error) => {
              console.error('Error updating API call log:', error);
            });
        }
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(502).json({
          success: false,
          error: 'Failed to proxy request to target API',
        });
      },
    });

    // Execute proxy
    proxy(req, res, () => {
      // Proxy completed
    });
  } catch (error: any) {
    console.error('Handle proxied request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

export { router as proxyRouter };

