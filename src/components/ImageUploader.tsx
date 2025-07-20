"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client"; // Import Supabase client

const ImageUploader = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedImageUrls, setProcessedImageUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(Array.from(event.target.files));
      setProcessedImageUrls([]); // Clear previous processed image URLs
    } else {
      setSelectedFiles([]);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      showError("Please select at least one file first.");
      return;
    }

    setIsUploading(true);
    const newProcessedUrls: string[] = [];
    const totalFiles = selectedFiles.length;
    let processedCount = 0;

    const toastId = showLoading(`Processing 0/${totalFiles} images...`);

    for (const file of selectedFiles) {
      const fileName = `${Date.now()}-${file.name}`;
      const rawFilePath = fileName;

      try {
        // 1. Upload the raw image to the 'raw-images' bucket
        const { error: uploadError } = await supabase.storage
          .from('raw-images')
          .upload(rawFilePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Upload failed for ${file.name}: ${uploadError.message}`);
        }

        // 2. Invoke the Edge Function for processing
        const edgeFunctionUrl = `https://jitmryvgkeuwmmzjcfwj.supabase.co/functions/v1/process-image`; 
        
        const response = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ filePath: rawFilePath }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Processing failed for ${file.name} with status ${response.status}: ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();

        if (data && data.processedImageUrl) {
          newProcessedUrls.push(data.processedImageUrl);
          processedCount++;
          showLoading(`Processing ${processedCount}/${totalFiles} images...`);
        } else {
          throw new Error(`Processing failed for ${file.name}: No processed image URL returned.`);
        }

        // 3. Optionally, delete the raw image after successful processing
        const { error: deleteError } = await supabase.storage
          .from('raw-images')
          .remove([rawFilePath]);

        if (deleteError) {
          console.error(`Error deleting raw image ${file.name}:`, deleteError.message);
        }

      } catch (error: any) {
        console.error(`Error processing ${file.name}:`, error);
        showError(`Failed to process ${file.name}: ${error.message}`);
      }
    }

    setProcessedImageUrls(newProcessedUrls);
    dismissToast(toastId);
    setIsUploading(false);
    setSelectedFiles([]); // Clear selected files after processing

    if (newProcessedUrls.length > 0) {
      showSuccess(`Successfully processed ${newProcessedUrls.length} out of ${totalFiles} images!`);
    } else {
      showError("No images were successfully processed.");
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Image Cropper & Uploader</CardTitle>
        <CardDescription>
          Select PNG images to crop 45px from the bottom and convert to JPEG.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <label htmlFor="picture" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Pictures (PNG only)
          </label>
          <Input id="picture" type="file" accept="image/png" multiple onChange={handleFileChange} />
        </div>
        {selectedFiles.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <p>Selected files ({selectedFiles.length}):</p>
            <ul className="list-disc list-inside max-h-24 overflow-y-auto">
              {selectedFiles.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
          </div>
        )}
        <Button onClick={handleUpload} disabled={selectedFiles.length === 0 || isUploading}>
          {isUploading ? "Processing..." : `Upload and Process ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''} Images`}
        </Button>
        {processedImageUrls.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2">Processed Images:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-60 overflow-y-auto">
              {processedImageUrls.map((url, index) => (
                <div key={index} className="border rounded-md p-2 flex flex-col items-center">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs break-all mb-1">
                    {url.split('/').pop()}
                  </a>
                  <img src={url} alt={`Processed ${index}`} className="max-w-full h-auto rounded-md shadow-md" />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Right-click or long-press on an image/link to save it.
            </p>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-4">
          Note: Actual image cropping and format conversion happen on the Supabase Edge Function.
        </p>
      </CardContent>
    </Card>
  );
};

export default ImageUploader;