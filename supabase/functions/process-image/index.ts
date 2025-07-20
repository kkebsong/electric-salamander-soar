import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'; // Временно закомментировано для отладки

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
      return new Response(JSON.stringify({ message: 'Body is empty!', rawBody: rawBody }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // Возвращаем 200 для отладки
      });
    } else {
      let parsedBody;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch (parseError: any) {
        return new Response(JSON.stringify({ message: `Failed to parse JSON: ${parseError.message}`, rawBody: rawBody }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      return new Response(JSON.stringify({ message: 'Body received and parsed!', parsedBody: parsedBody, rawBody: rawBody }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

  } catch (error: any) {
    console.error('Edge Function: Uncaught error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});