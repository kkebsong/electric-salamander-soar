"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client"; // Import Supabase client

const ImageUploader = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setProcessedImageUrl(null); // Clear previous processed image URL
    } else {
      setSelectedFile(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showError("Please select a file first.");
      return;
    }

    const toastId = showLoading("Uploading and processing image...");
    const fileName = `${Date.now()}-${selectedFile.name}`;
    const rawFilePath = fileName;

    try {
      // 1. Upload the raw image to the 'raw-images' bucket
      const { error: uploadError } = await supabase.storage
        .from('raw-images')
        .upload(rawFilePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      showSuccess("Image uploaded to raw storage. Processing...");

      // 2. Invoke the Edge Function for processing using direct fetch
      // Используем жестко закодированный URL функции Edge Function
      const edgeFunctionUrl = `https://jitmryvgkeuwmmzjcfwj.supabase.co/functions/v1/process-image`; 
      
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Передаем ключ anon для авторизации, если функция требует аутентификации
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ filePath: rawFilePath }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Processing failed with status ${response.status}: ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();

      if (data && data.processedImageUrl) {
        setProcessedImageUrl(data.processedImageUrl);
        showSuccess('Image processed and uploaded successfully!');
      } else {
        throw new Error('Processing failed: No processed image URL returned.');
      }

      // 3. Optionally, delete the raw image after successful processing
      const { error: deleteError } = await supabase.storage
        .from('raw-images')
        .remove([rawFilePath]);

      if (deleteError) {
        console.error("Error deleting raw image:", deleteError.message);
        // Не выбрасываем ошибку, так как основной процесс был успешным
      }

    } catch (error: any) {
      console.error('Upload/Processing error:', error);
      showError(`Failed to process and upload image: ${error.message}`);
    } finally {
      dismissToast(toastId);
      setSelectedFile(null); // Очищаем выбранный файл после "загрузки"
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Image Cropper & Uploader</CardTitle>
        <CardDescription>
          Select a PNG image to crop 45px from the bottom and convert to JPEG.
          (Processing happens on a simulated backend)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <label htmlFor="picture" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Picture
          </label>
          <Input id="picture" type="file" accept="image/png" onChange={handleFileChange} />
        </div>
        {selectedFile && (
          <p className="text-sm text-muted-foreground">Selected file: {selectedFile.name}</p>
        )}
        <Button onClick={handleUpload} disabled={!selectedFile}>
          Upload and Process
        </Button>
        {processedImageUrl && (
          <div className="mt-4">
            <p className="text-sm font-medium">Processed Image:</p>
            <a href={processedImageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
              {processedImageUrl}
            </a>
            <img src={processedImageUrl} alt="Processed" className="mt-2 max-w-full h-auto rounded-md shadow-md" />
          </div>
        )}
        <p className="text-xs text-gray-500 mt-4">
          Note: Actual image cropping and format conversion require a dedicated image processing library or service.
          This demonstration simulates the client-side interaction and file movement within Supabase Storage.
        </p>
      </CardContent>
    </Card>
  );
};

export default ImageUploader;