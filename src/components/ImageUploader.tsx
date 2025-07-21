"use client";

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";
import { UploadCloud } from "lucide-react";

const ImageUploader = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [cropAmount, setCropAmount] = useState<number>(45); // Default from screenshot
  const [downloadFolderName, setDownloadFolderName] = useState<string>("processed_images"); // Default from screenshot
  const [isUploading, setIsUploading] = useState(false);
  const [processedImageUrls, setProcessedImageUrls] = useState<string[]>([]); // New state for preview URLs

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(Array.from(event.target.files));
      setProcessedImageUrls([]); // Clear previous previews
    } else {
      setSelectedFiles([]);
    }
  };

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const files = Array.from(event.dataTransfer.files).filter(file => file.type === "image/png");
      setSelectedFiles(files);
      setProcessedImageUrls([]); // Clear previous previews
      event.dataTransfer.clearData();
    }
  }, []);

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      showError("Please select PNG files first.");
      return;
    }

    setIsUploading(true);
    const overallToastId = showLoading("Starting image upload and processing...");
    const tempProcessedImageUrls: string[] = []; // Use a temporary array to collect URLs

    for (const file of selectedFiles) {
      try {
        // 1. Upload original PNG to Supabase Storage
        const originalFilePath = `original/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(originalFilePath, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        // 2. Invoke Edge Function for processing
        const { data: processResult, error: processError } = await supabase.functions.invoke('process-image', {
          body: { filePath: originalFilePath, fileName: file.name, cropAmount: cropAmount },
          headers: { 'Content-Type': 'application/json' },
        });

        if (processError) {
          throw processError;
        }

        if (processResult && processResult.publicUrl) { // Use publicUrl for preview
          tempProcessedImageUrls.push(processResult.publicUrl);
        } else {
          throw new Error("Processing failed: No public URL returned.");
        }

      } catch (error: any) {
        console.error(`Error processing ${file.name}:`, error);
        showError(`Failed to process ${file.name}: ${error.message}`);
      }
    }

    dismissToast(overallToastId);
    setIsUploading(false);
    setSelectedFiles([]); // Clear selected files after processing attempt
    setProcessedImageUrls(tempProcessedImageUrls); // Set the collected URLs for preview

    if (tempProcessedImageUrls.length > 0) {
      showSuccess(`Successfully processed ${tempProcessedImageUrls.length} image(s)!`);
      
      // Now, create and download the ZIP
      const zipToastId = showLoading("Creating ZIP archive for download...");
      try {
        const { data: zipResult, error: zipError } = await supabase.functions.invoke('create-zip', {
          body: { imagePaths: tempProcessedImageUrls.map(url => url.split('/public/images/')[1]), folderName: downloadFolderName }, // Pass only the path part
          headers: { 'Content-Type': 'application/json' },
        });

        if (zipError) {
          throw zipError;
        }

        if (zipResult && zipResult.zipUrl) {
          const link = document.createElement('a');
          link.href = zipResult.zipUrl;
          link.setAttribute('download', `${downloadFolderName}.zip`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          showSuccess("ZIP archive downloaded successfully!");
        } else {
          throw new Error("Failed to get ZIP download URL.");
        }
      } catch (error: any) {
        console.error("Error downloading ZIP:", error);
        showError(`Failed to download ZIP: ${error.message}`);
      } finally {
        dismissToast(zipToastId);
      }

    } else {
      showError("No images were successfully processed.");
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Image Cropper & Uploader</CardTitle>
        <CardDescription>
          Select PNG images to crop from the bottom and convert to JPEG.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition-colors"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => document.getElementById('fileInput')?.click()}
        >
          <UploadCloud className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Drag & drop PNG images here, or <span className="text-blue-500 hover:underline">click to browse</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">Only PNG files are supported.</p>
          <Input id="fileInput" type="file" accept="image/png" onChange={handleFileChange} multiple className="hidden" />
        </div>

        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Selected files:</p>
            <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300">
              {selectedFiles.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid w-full max-w-sm items-center gap-1.5">
          <label htmlFor="cropAmount" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Crop Amount (pixels from bottom)
          </label>
          <Input
            id="cropAmount"
            type="number"
            value={cropAmount}
            onChange={(e) => setCropAmount(Number(e.target.value))}
            min="0"
          />
        </div>

        <div className="grid w-full max-w-sm items-center gap-1.5">
          <label htmlFor="downloadFolderName" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Download Folder Name
          </label>
          <Input
            id="downloadFolderName"
            type="text"
            value={downloadFolderName}
            onChange={(e) => setDownloadFolderName(e.target.value)}
            placeholder="processed_images"
          />
        </div>

        <Button onClick={handleUpload} disabled={selectedFiles.length === 0 || isUploading} className="w-full">
          {isUploading ? "Uploading & Processing..." : "Upload and Process Images"}
        </Button>
        <p className="text-xs text-gray-500 mt-4">
          Note: Actual image cropping and format conversion happen on the Supabase Edge Function.
        </p>

        {processedImageUrls.length > 0 && (
          <div className="space-y-4 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Processed Image Previews:</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {processedImageUrls.map((url, index) => (
                <div key={index} className="relative w-full h-24 overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                  <img
                    src={url}
                    alt={`Processed image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImageUploader;