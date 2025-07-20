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
    const rawFilePath = `raw-images/${fileName}`;

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

      // 2. Invoke the Edge Function for processing
      const { data, error: invokeError } = await supabase.functions.invoke('process-image', {
        body: JSON.stringify({ filePath: rawFilePath }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (invokeError) {
        throw new Error(`Processing failed: ${invokeError.message}`);
      }

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
        // Don't throw, as the main process was successful
      }

    } catch (error: any) {
      console.error('Upload/Processing error:', error);
      showError(`Failed to process and upload image: ${error.message}`);
    } finally {
      dismissToast(toastId);
      setSelectedFile(null); // Clear selected file after "upload"
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