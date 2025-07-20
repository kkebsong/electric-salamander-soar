import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Edge Function: Request received.');
    console.log('Edge Function: Content-Type:', req.headers.get('content-type'));

    let requestBody;
    try {
      const rawBody = await req.text();
      console.log('Edge Function: Raw request body:', rawBody);
      if (!rawBody) {
        throw new Error('Request body is empty.');
      }
      requestBody = JSON.parse(rawBody);
    } catch (parseError: any) {
      console.error('Edge Function: Error parsing request body:', parseError);
      return new Response(JSON.stringify({ error: `Invalid request body: ${parseError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const { filePath } = requestBody;
    console.log('Edge Function: Received filePath:', filePath);

    if (!filePath) {
      console.error('Edge Function: File path is required.');
      return new Response(JSON.stringify({ error: 'File path is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );
    console.log('Edge Function: Supabase client created.');

    const fileName = filePath.split('/').pop();
    if (!fileName) {
      console.error('Edge Function: Invalid file path, could not extract file name.');
      return new Response(JSON.stringify({ error: 'Invalid file path' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    console.log('Edge Function: Extracted fileName:', fileName);

    const processedFileName = fileName.replace(/\.png$/i, '.jpeg');
    console.log('Edge Function: New processed file name:', processedFileName);

    // 1. Download the raw image from the 'raw-images' bucket
    console.log(`Edge Function: Attempting to download raw image: ${filePath} from 'raw-images'.`);
    const { data: rawImageData, error: downloadError } = await supabaseClient
      .storage
      .from('raw-images')
      .download(filePath);

    if (downloadError) {
      console.error('Edge Function: Error downloading raw image:', downloadError);
      return new Response(JSON.stringify({ error: `Failed to download raw image: ${downloadError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    console.log('Edge Function: Raw image downloaded successfully.');

    // 2. Simulate image processing and upload to 'processed-images' bucket
    // In a real scenario, you would perform actual image cropping and conversion here.
    // For this demonstration, we'll re-upload the same data but with a JPEG content type.
    const processedImageBlob = rawImageData; 

    console.log(`Edge Function: Attempting to upload processed image: ${processedFileName} to 'processed-images'.`);
    const { error: uploadProcessedError } = await supabaseClient
      .storage
      .from('processed-images')
      .upload(processedFileName, processedImageBlob, {
        contentType: 'image/jpeg', // Assuming conversion to JPEG
        cacheControl: '3600',
        upsert: true, // Allow overwriting if file exists
      });

    if (uploadProcessedError) {
      console.error('Edge Function: Error uploading processed image:', uploadProcessedError);
      return new Response(JSON.stringify({ error: `Failed to upload processed image: ${uploadProcessedError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    console.log('Edge Function: Processed image uploaded successfully.');

    // 3. Get the public URL for the processed image
    console.log(`Edge Function: Getting public URL for ${processedFileName} from 'processed-images' bucket.`);
    const { data: publicUrlData } = supabaseClient
      .storage
      .from('processed-images')
      .getPublicUrl(processedFileName);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      console.error('Edge Function: Could not get public URL for processed image.');
      return new Response(JSON.stringify({ error: 'Could not get public URL for processed image.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    console.log('Edge Function: Public URL obtained:', publicUrlData.publicUrl);

    // 4. Delete the raw image from the 'raw-images' bucket
    console.log(`Edge Function: Attempting to delete raw image: ${filePath} from 'raw-images'.`);
    const { error: deleteRawError } = await supabaseClient
      .storage
      .from('raw-images')
      .remove([filePath]);

    if (deleteRawError) {
      console.error('Edge Function: Error deleting raw image:', deleteRawError);
      // Don't return an error, as the main process was successful
    } else {
      console.log('Edge Function: Raw image deleted successfully.');
    }

    return new Response(JSON.stringify({ processedImageUrl: publicUrlData.publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Edge Function: Uncaught error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});