/**
 * CoinGecko API Utility
 * 
 * Fetches STX price in USD for displaying prices throughout the application.
 * Uses CoinGecko's free API with caching to avoid rate limits.
 */

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_DURATION = 60000; // Cache for 1 minute

interface PriceCache {
  price: number;
  timestamp: number;
}

let priceCache: PriceCache | null = null;

/**
 * Get STX price in USD from CoinGecko
 * 
 * Returns the current STX price in USD, with caching to avoid excessive API calls.
 * Falls back to a default price if the API fails.
 */
export async function getSTXPriceUSD(): Promise<number> {
  // Return cached price if still valid
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION) {
    return priceCache.price;
  }

  try {
    const response = await fetch(
      `${COINGECKO_API_URL}?ids=blockstack&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    const price = data?.blockstack?.usd;

    if (!price || typeof price !== 'number') {
      throw new Error('Invalid price data from CoinGecko');
    }

    // Cache the price
    priceCache = {
      price,
      timestamp: Date.now(),
    };

    return price;
  } catch (error) {
    console.error('Error fetching STX price from CoinGecko:', error);
    
    // Return cached price if available, otherwise fallback to a reasonable default
    if (priceCache) {
      console.warn('Using cached STX price due to API error');
      return priceCache.price;
    }

    // Fallback to approximate price (update this if STX price changes significantly)
    console.warn('Using fallback STX price: $1.50');
    return 1.50;
  }
}

/**
 * Convert STX amount to USD
 */
export async function stxToUSD(stxAmount: number): Promise<number> {
  const price = await getSTXPriceUSD();
  return stxAmount * price;
}

/**
 * Convert microSTX amount to USD
 */
export async function microstxToUSD(microstxAmount: number): Promise<number> {
  const stxAmount = microstxAmount / 1000000;
  return stxToUSD(stxAmount);
}

