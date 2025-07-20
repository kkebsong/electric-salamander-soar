"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

interface ProcessedImage {
  originalName: string;
  processedUrl: string;
  processedPath: string;
}

const ImageUploader = ({ onImagesProcessed }: { onImagesProcessed: (images: ProcessedImage[]) => void }) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());
  const [processingStatus, setProcessingStatus] = useState<Map<string, string>>(new Map());
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(Array.from(event.target.files));
      setUploadProgress(new Map());
      setProcessingStatus(new Map());
    } else {
      setSelectedFiles([]);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      showError("Please select files first.");
      return;
    }

    setIsUploading(true);
    const overallToastId = showLoading("Starting image upload and processing...");
    const processedImages: ProcessedImage[] = [];

    for (const file of selectedFiles) {
      const fileId = file.name + Date.now(); // Unique ID for tracking
      setProcessingStatus(prev => new Map(prev).set(fileId, "Uploading..."));
      setUploadProgress(prev => new Map(prev).set(fileId, 0));

      try {
        // 1. Upload original PNG to Supabase Storage
        const originalFilePath = `original/${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('images')
          .upload(originalFilePath, file, {
            cacheControl: '3600',
            upsert: true,
            onUploadProgress: (event) => {
              const progress = (event.loaded / event.total) * 100;
              setUploadProgress(prev => new Map(prev).set(fileId, progress));
            },
          });

        if (uploadError) {
          throw uploadError;
        }

        setProcessingStatus(prev => new Map(prev).set(fileId, "Processing..."));

        // 2. Invoke Edge Function for processing
        const { data: processResult, error: processError } = await supabase.functions.invoke('process-image', {
          body: { filePath: originalFilePath, fileName: file.name },
          headers: { 'Content-Type': 'application/json' },
        });

        if (processError) {
          throw processError;
        }

        if (processResult && processResult.publicUrl) {
          processedImages.push({
            originalName: file.name,
            processedUrl: processResult.publicUrl,
            processedPath: processResult.processedFilePath,
          });
          setProcessingStatus(prev => new Map(prev).set(fileId, "Completed"));
        } else {
          throw new Error("Processing failed: No public URL returned.");
        }

      } catch (error: any) {
        console.error(`Error processing ${file.name}:`, error);
        setProcessingStatus(prev => new Map(prev).set(fileId, `Failed: ${error.message}`));
        showError(`Failed to process ${file.name}: ${error.message}`);
      }
    }

    dismissToast(overallToastId);
    setIsUploading(false);
    setSelectedFiles([]); // Clear selected files after processing attempt

    if (processedImages.length > 0) {
      showSuccess(`Successfully processed ${processedImages.length} image(s)!`);
      onImagesProcessed(processedImages);
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
          <Input id="picture" type="file" accept="image/png" onChange={handleFileChange} multiple />
        </div>
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Selected files:</p>
            <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300">
              {selectedFiles.map((file, index) => (
                <li key={index} className="flex justify-between items-center">
                  <span>{file.name}</span>
                  {processingStatus.has(file.name + Date.now()) && (
                    <span className="text-xs ml-2">
                      {processingStatus.get(file.name + Date.now())}
                      {uploadProgress.get(file.name + Date.now()) !== undefined && processingStatus.get(file.name + Date.now()) === "Uploading..." && (
                        <Progress value={uploadProgress.get(file.name + Date.now())} className="w-[100px] h-2 ml-2 inline-block" />
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button onClick={handleUpload} disabled={selectedFiles.length === 0 || isUploading}>
          {isUploading ? "Uploading & Processing..." : "Upload and Process All"}
        </Button>
        <p className="text-xs text-gray-500 mt-4">
          Images will be uploaded to Supabase Storage and processed by an Edge Function.
        </p>
      </CardContent>
    </Card>
  );
};

export default ImageUploader;