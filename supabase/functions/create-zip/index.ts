import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { ZipWriter } from "https://deno.land/x/zip@v1.2.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imagePaths, folderName } = await req.json();

    if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
      return new Response(JSON.stringify({ error: 'No image paths provided' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Supabase URL or Service Role Key not set in environment variables.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    const zipWriter = new ZipWriter();

    for (const path of imagePaths) {
      const { data: imageData, error: downloadError } = await supabase.storage
        .from('images')
        .download(path);

      if (downloadError) {
        console.error(`Failed to download ${path}:`, downloadError);
        continue; // Skip this file, but continue with others
      }

      if (imageData) {
        const fileName = path.split('/').pop(); // Get filename from path
        await zipWriter.add(fileName!, new Uint8Array(await imageData.arrayBuffer()));
      }
    }

    const zipBuffer = await zipWriter.generate(true); // Generate ZIP as Uint8Array

    // Upload the ZIP file to Supabase Storage
    const zipFileName = `archives/${folderName || 'processed_images'}_${Date.now()}.zip`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('images')
      .upload(zipFileName, zipBuffer, {
        contentType: 'application/zip',
        upsert: true,
      });

    if (uploadError) {
      console.error('ZIP upload error:', uploadError);
      throw uploadError;
    }

    // Get the public URL of the uploaded ZIP file
    const { data: publicUrlData } = supabase.storage
      .from('images')
      .getPublicUrl(zipFileName);

    return new Response(JSON.stringify({ zipUrl: publicUrlData.publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Edge Function error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});