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

    const { filePath } = parsedBody;

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'Missing filePath in request body.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Инициализация клиента Supabase с сервисным ключом для доступа к бакетам
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Имитация обработки изображения:
    // Создаем новое имя файла для "обработанного" изображения (например, меняем расширение на .jpeg)
    const processedFileName = filePath.replace(/\.png$/i, '_processed.jpeg');

    // Создаем фиктивное содержимое для имитации обработанного изображения
    const dummyProcessedContent = new TextEncoder().encode(`Simulated processed content for ${filePath}`);

    // Загружаем фиктивное обработанное изображение в бакет 'processed-images'
    const { error: uploadProcessedError } = await supabase.storage
      .from('processed-images')
      .upload(processedFileName, dummyProcessedContent, {
        contentType: 'image/jpeg', // Имитируем вывод JPEG
        cacheControl: '3600',
        upsert: true, // Разрешаем перезапись для тестирования
      });

    if (uploadProcessedError) {
      console.error('Edge Function: Error uploading simulated processed image:', uploadProcessedError);
      return new Response(JSON.stringify({ error: `Failed to upload simulated processed image: ${uploadProcessedError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // Получаем публичный URL для только что загруженного "обработанного" изображения
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