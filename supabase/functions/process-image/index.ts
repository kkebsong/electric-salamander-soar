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
    const { filePath } = await req.json();
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
    const newFilePath = `processed-images/${processedFileName}`;
    console.log('Edge Function: New processed file path:', newFilePath);

    console.log(`Edge Function: Attempting to move file from ${filePath} to ${newFilePath}`);
    const { data, error: moveError } = await supabaseClient
      .storage
      .from('raw-images')
      .move(filePath, newFilePath);

    if (moveError) {
      console.error('Edge Function: Error moving file:', moveError);
      return new Response(JSON.stringify({ error: `Failed to move file: ${moveError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    console.log('Edge Function: File moved successfully. Data:', data);

    console.log(`Edge Function: Getting public URL for ${processedFileName} from processed-images bucket.`);
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