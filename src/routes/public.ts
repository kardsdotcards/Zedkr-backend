/**
 * Public API Routes
 * 
 * Routes that don't require authentication, including:
 * - Public stats
 * - STX price endpoint (for frontend USD conversion)
 */

import express from 'express';
import { getSTXPriceUSD } from '../utils/coingecko.js';

const router = express.Router();

/**
 * GET /api/public/stats
 * Get public statistics about the platform
 */
router.get('/stats', async (req, res) => {
  try {
    // Return basic public stats
    res.json({
      success: true,
      data: {
        totalAPIs: 0, // Can be populated from database if needed
        totalCalls: 0,
        totalRevenue: 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching public stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/public/stx-price
 * Get current STX price in USD from CoinGecko
 * 
 * Used by frontend to display USD equivalents of STX prices
 */
router.get('/stx-price', async (req, res) => {
  try {
    const price = await getSTXPriceUSD();
    res.json({
      success: true,
      price,
      currency: 'USD',
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('Error fetching STX price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch STX price',
    });
  }
});

export default router;
