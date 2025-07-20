"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client"; // Import Supabase client
import { X, UploadCloud } from "lucide-react"; // Import X and UploadCloud icons

const ImageUploader = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [processedImageUrls, setProcessedImageUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [cropAmount, setCropAmount] = useState<number>(45);
  const [isDragging, setIsDragging] = useState(false); // New state for drag-and-drop visual feedback

  // Effect to clean up object URLs when component unmounts or files change
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const processFiles = useCallback((files: FileList | File[]) => {
    const pngFiles = Array.from(files).filter(file => file.type === 'image/png');
    if (pngFiles.length === 0 && files.length > 0) {
      showError("Only PNG images are supported. Please select PNG files.");
      return;
    }
    setSelectedFiles(prevFiles => [...prevFiles, ...pngFiles]);
    setProcessedImageUrls([]);

    const newPreviewUrls = pngFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(prevUrls => [...prevUrls, ...newPreviewUrls]);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      processFiles(event.target.files);
    }
  };

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      processFiles(event.dataTransfer.files);
      event.dataTransfer.clearData();
    }
  }, [processFiles]);

  const handleCropAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    setCropAmount(isNaN(value) ? 0 : value);
  };

  const handleRemoveFile = (indexToRemove: number) => {
    const newSelectedFiles = selectedFiles.filter((_, index) => index !== indexToRemove);
    const newPreviewUrls = previewUrls.filter((_, index) => index !== indexToRemove);
    
    URL.revokeObjectURL(previewUrls[indexToRemove]);

    setSelectedFiles(newSelectedFiles);
    setPreviewUrls(newPreviewUrls);
    showSuccess(`Removed file: ${selectedFiles[indexToRemove]?.name}`);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      showError("Please select at least one file first.");
      return;
    }
    if (cropAmount < 0) {
      showError("Crop amount cannot be negative.");
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
        const { error: uploadError } = await supabase.storage
          .from('raw-images')
          .upload(rawFilePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Upload failed for ${file.name}: ${uploadError.message}`);
        }

        const edgeFunctionUrl = `https://jitmryvgkeuwmmzjcfwj.supabase.co/functions/v1/process-image`; 
        
        const response = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ filePath: rawFilePath, cropAmount: cropAmount }),
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
    setSelectedFiles([]);
    setPreviewUrls([]);

    if (newProcessedUrls.length > 0) {
      showSuccess(`Successfully processed ${newProcessedUrls.length} out of ${totalFiles} images!`);
    } else {
      showError("No images were successfully processed.");
    }
  };

  const handleDownloadAll = () => {
    if (processedImageUrls.length === 0) {
      showError("No processed images to download.");
      return;
    }

    showSuccess(`Attempting to download ${processedImageUrls.length} images. Please allow pop-ups if prompted.`);

    processedImageUrls.forEach((url, index) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = url.split('/').pop() || `processed_image_${index}.jpeg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  const handleReset = () => {
    setSelectedFiles([]);
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]); 
    setProcessedImageUrls([]);
    setIsUploading(false);
    setCropAmount(45);
    showSuccess("All selections and processed images have been cleared.");
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
          className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Input 
            id="picture" 
            type="file" 
            accept="image/png" 
            multiple 
            onChange={handleFileChange} 
            className="absolute inset-0 opacity-0 cursor-pointer" 
          />
          <div className="flex flex-col items-center justify-center space-y-2">
            <UploadCloud className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Drag & drop PNG images here, or <span className="text-blue-500 hover:underline">click to browse</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Only PNG files are supported.</p>
          </div>
        </div>

        <div className="grid w-full max-w-sm items-center gap-1.5">
          <label htmlFor="crop-amount" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Crop Amount (pixels from bottom)
          </label>
          <Input 
            id="crop-amount" 
            type="number" 
            value={cropAmount} 
            onChange={handleCropAmountChange} 
            min="0" 
            placeholder="e.g., 45"
          />
        </div>
        {selectedFiles.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <p>Selected files ({selectedFiles.length}):</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 max-h-40 overflow-y-auto">
              {previewUrls.map((url, index) => (
                <div key={index} className="relative group">
                  <img src={url} alt={`Preview ${index}`} className="w-full h-20 object-cover rounded-md shadow-sm" />
                  <span className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate rounded-b-md">
                    {selectedFiles[index]?.name}
                  </span>
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleUpload} disabled={selectedFiles.length === 0 || isUploading} className="flex-grow">
            {isUploading ? "Processing..." : `Upload and Process ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''} Images`}
          </Button>
          {processedImageUrls.length > 0 && (
            <Button onClick={handleDownloadAll} disabled={isUploading} className="flex-grow" variant="secondary">
              Download All ({processedImageUrls.length})
            </Button>
          )}
        </div>
        {(selectedFiles.length > 0 || processedImageUrls.length > 0) && (
          <Button onClick={handleReset} variant="outline" className="w-full">
            Reset
          </Button>
        )}
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