/**
 * Update monetized URLs for endpoints
 * 
 * This function is called by the backend to update monetized_url
 * for endpoints that don't have it set yet.
 * 
 * Monetized URL format: https://zedkr.up.railway.app/{username}/{apiNameSlug}/{endpointPath}
 */

import { supabase } from '../config/supabase.js';

const ZEDKR_DOMAIN = process.env.ZEDKR_DOMAIN || 'https://zedkr.up.railway.app';

export async function updateMonetizedUrls() {
  try {
    // Check if Supabase is properly configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('⚠️  Supabase not configured, skipping monetized URL update');
      return;
    }

    // Get all endpoints that don't have monetized_url set
    const { data: endpoints, error: fetchError } = await supabase
      .from('endpoints')
      .select(`
        id,
        endpoint_path,
        apis!inner (
          id,
          api_name_slug,
          users!inner (
            username
          )
        )
      `)
      .is('monetized_url', null)
      .eq('active', true);

    if (fetchError) {
      console.error('Error fetching endpoints:', {
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
        code: fetchError.code,
      });
      return;
    }

    if (!endpoints || endpoints.length === 0) {
      return; // No endpoints to update
    }

    // Update each endpoint with monetized URL
    for (const endpoint of endpoints) {
      const api = (endpoint as any).apis;
      const user = api?.users;
      
      if (!user?.username || !api?.api_name_slug || !endpoint.endpoint_path) {
        console.warn(`Skipping endpoint ${endpoint.id}: missing username, api_name_slug, or endpoint_path`);
        continue;
      }

      const monetizedUrl = `${ZEDKR_DOMAIN}/${user.username}/${api.api_name_slug}/${endpoint.endpoint_path}`;

      const { error: updateError } = await supabase
        .from('endpoints')
        .update({ monetized_url: monetizedUrl })
        .eq('id', endpoint.id);

      if (updateError) {
        console.error(`Error updating monetized URL for endpoint ${endpoint.id}:`, updateError);
      } else {
        console.log(`Updated monetized URL for endpoint ${endpoint.id}: ${monetizedUrl}`);
      }
    }
  } catch (error: any) {
    // Handle network/fetch errors gracefully
    if (error?.message?.includes('fetch failed') || error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
      console.warn('⚠️  Network error updating monetized URLs (Supabase may be unreachable):', error.message);
    } else {
      console.error('Error in updateMonetizedUrls:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
      });
    }
  }
}

/**
 * Update monetized URL for a specific endpoint
 * Called when backend reads an endpoint that doesn't have monetized_url
 */
export async function updateMonetizedUrlForEndpoint(endpointId: string) {
  try {
    const { data: endpoint, error: fetchError } = await supabase
      .from('endpoints')
      .select(`
        id,
        endpoint_path,
        monetized_url,
        apis!inner (
          id,
          api_name_slug,
          users!inner (
            username
          )
        )
      `)
      .eq('id', endpointId)
      .single();

    if (fetchError || !endpoint) {
      console.error('Error fetching endpoint:', fetchError);
      return;
    }

    // If monetized_url already exists, skip
    if ((endpoint as any).monetized_url) {
      return;
    }

    const api = (endpoint as any).apis;
    const user = api?.users;

    if (!user?.username || !api?.api_name_slug || !endpoint.endpoint_path) {
      console.warn(`Cannot generate monetized URL for endpoint ${endpointId}: missing username, api_name_slug, or endpoint_path`);
      return;
    }

    const ZEDKR_DOMAIN = process.env.ZEDKR_DOMAIN || 'https://zedkr.up.railway.app';
    const monetizedUrl = `${ZEDKR_DOMAIN}/${user.username}/${api.api_name_slug}/${endpoint.endpoint_path}`;

    const { error: updateError } = await supabase
      .from('endpoints')
      .update({ monetized_url: monetizedUrl })
      .eq('id', endpointId);

    if (updateError) {
      console.error(`Error updating monetized URL for endpoint ${endpointId}:`, updateError);
    }
  } catch (error) {
    console.error('Error in updateMonetizedUrlForEndpoint:', error);
  }
}

