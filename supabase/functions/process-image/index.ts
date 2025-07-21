import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { Image } from "https://deno.land/x/deno_image/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { filePath, fileName, cropAmount } = await req.json();

    if (!filePath || !fileName || typeof cropAmount !== 'number') {
      return new Response(JSON.stringify({ error: 'Missing filePath, fileName, or cropAmount' }), {
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

    // Download the original PNG image from Supabase Storage
    const { data: imageData, error: downloadError } = await supabase.storage
      .from('images')
      .download(filePath);

    if (downloadError) {
      console.error('Download error:', downloadError);
      throw downloadError;
    }

    if (!imageData) {
      throw new Error('Image data is null after download.');
    }

    const imageBuffer = await imageData.arrayBuffer();
    const image = new Image(new Uint8Array(imageBuffer));

    // Crop 'cropAmount' pixels from the bottom
    const originalHeight = image.height;
    const newHeight = originalHeight - cropAmount;

    if (newHeight <= 0) {
      throw new Error(`Image is too short to crop ${cropAmount} pixels from the bottom.`);
    }

    const croppedImage = image.crop(0, 0, image.width, newHeight);

    // Convert to JPEG
    const jpegBuffer = croppedImage.encode(Image.Format.Jpeg);

    // Upload the processed JPEG image to Supabase Storage
    const processedFileName = `${fileName.split('.')[0]}.jpeg`;
    const processedFilePath = `processed/${processedFileName}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('images')
      .upload(processedFilePath, jpegBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Get the public URL of the uploaded image (though not used in new UI, good for debugging)
    const { data: publicUrlData } = supabase.storage
      .from('images')
      .getPublicUrl(processedFilePath);

    return new Response(JSON.stringify({ publicUrl: publicUrlData.publicUrl, processedFilePath }), {
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