import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts"; // Импортируем imagescript

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

    const rawBody = await req.text();
    console.log('Edge Function: Raw request body:', rawBody);

    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Request body is empty.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
      console.log('Edge Function: Parsed request body:', parsedBody);
    } catch (parseError: any) {
      console.error('Edge Function: Failed to parse JSON:', parseError);
      return new Response(JSON.stringify({ error: `Failed to parse JSON: ${parseError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const { filePath, cropAmount } = parsedBody; // Get cropAmount from body

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'Missing filePath in request body.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Validate cropAmount
    const actualCropAmount = typeof cropAmount === 'number' && cropAmount >= 0 ? cropAmount : 45; // Default to 45 if not provided or invalid
    console.log(`Edge Function: Using crop amount: ${actualCropAmount}px`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Загружаем исходное изображение из бакета 'raw-images'
    const { data: imageData, error: downloadError } = await supabase.storage
      .from('raw-images')
      .download(filePath);

    if (downloadError) {
      console.error('Edge Function: Error downloading raw image:', downloadError);
      return new Response(JSON.stringify({ error: `Failed to download raw image: ${downloadError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!imageData) {
      return new Response(JSON.stringify({ error: 'Downloaded image data is empty.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // Конвертируем ArrayBuffer в Uint8Array для imagescript
    const imageBuffer = new Uint8Array(await imageData.arrayBuffer());

    // 2. Обрабатываем изображение с помощью imagescript
    let image;
    try {
      image = await Image.decode(imageBuffer);
    } catch (decodeError: any) {
      console.error('Edge Function: Error decoding image:', decodeError);
      return new Response(JSON.stringify({ error: `Failed to decode image: ${decodeError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // Обрезаем снизу на указанное количество пикселей
    const newHeight = image.height - actualCropAmount;
    if (newHeight <= 0) {
      return new Response(JSON.stringify({ error: `Image is too short (${image.height}px) to crop ${actualCropAmount}px from the bottom.` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    image.crop(0, 0, image.width, newHeight);

    // Конвертируем в JPEG (0 для JPEG)
    const processedImageBuffer = await image.encode(0); 

    // 3. Загружаем обработанное изображение в бакет 'processed-images'
    const processedFileName = filePath.replace(/\.png$/i, `_cropped_${actualCropAmount}px.jpeg`); // Меняем расширение и добавляем _cropped
    const { error: uploadProcessedError } = await supabase.storage
      .from('processed-images')
      .upload(processedFileName, processedImageBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadProcessedError) {
      console.error('Edge Function: Error uploading processed image:', uploadProcessedError);
      return new Response(JSON.stringify({ error: `Failed to upload processed image: ${uploadProcessedError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // 4. Получаем публичный URL для обработанного изображения
    const { data: publicUrlData } = supabase.storage
      .from('processed-images')
      .getPublicUrl(processedFileName);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      console.error('Edge Function: Failed to get public URL for processed image.');
      return new Response(JSON.stringify({ error: 'Failed to get public URL for processed image.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const processedImageUrl = publicUrlData.publicUrl;
    console.log('Edge Function: Processed image URL:', processedImageUrl);

    return new Response(JSON.stringify({ processedImageUrl }), {
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