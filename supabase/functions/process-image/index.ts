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
    const { filePath } = await req.json();

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'File path is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use service role key for server-side operations
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Extract file name from the path (e.g., 'raw-images/my-image.png' -> 'my-image.png')
    const fileName = filePath.split('/').pop();
    if (!fileName) {
      return new Response(JSON.stringify({ error: 'Invalid file path' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Generate a new file name for the processed image (e.g., 'my-image.jpeg')
    const processedFileName = fileName.replace(/\.png$/i, '.jpeg');
    const newFilePath = `processed-images/${processedFileName}`;

    // Simulate processing by moving the file from raw-images to processed-images
    // Note: Actual image cropping and format conversion would require a dedicated image processing library
    // or service, which is beyond the scope of a simple Deno Edge Function without external dependencies.
    // Here, we are just demonstrating the file movement and renaming.
    const { data, error: moveError } = await supabaseClient
      .storage
      .from('raw-images')
      .move(filePath, newFilePath);

    if (moveError) {
      console.error('Error moving file:', moveError);
      return new Response(JSON.stringify({ error: moveError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // Get the public URL of the processed image
    const { data: publicUrlData } = supabaseClient
      .storage
      .from('processed-images')
      .getPublicUrl(processedFileName);

    return new Response(JSON.stringify({ processedImageUrl: publicUrlData.publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});