"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";
import { X, UploadCloud, Loader2, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface UploadFile {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'uploading' | 'processing' | 'success' | 'error';
  processedUrl?: string;
  errorMessage?: string;
}

const ImageUploader = () => {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [processedImageUrls, setProcessedImageUrls] = useState<string[]>([]);
  const [isUploadingGlobal, setIsUploadingGlobal] = useState(false);
  const [cropAmount, setCropAmount] = useState<number>(45);
  const [folderName, setFolderName] = useState<string>("processed_images");
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
      uploadFiles.forEach(uploadFile => URL.revokeObjectURL(uploadFile.previewUrl));
    };
  }, [uploadFiles]);

  const processFiles = useCallback((files: FileList | File[]) => {
    const newUploadFiles: UploadFile[] = [];
    const nonPngFiles: File[] = [];

    Array.from(files).forEach(file => {
      if (file.type === 'image/png') {
        newUploadFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          file: file,
          previewUrl: URL.createObjectURL(file),
          status: 'pending',
        });
      } else {
        nonPngFiles.push(file);
      }
    });

    if (nonPngFiles.length > 0) {
      showError(`Skipped ${nonPngFiles.length} non-PNG file(s). Only PNG images are supported.`);
    }

    if (newUploadFiles.length === 0 && files.length > 0 && nonPngFiles.length === 0) {
      showError("No valid PNG images were selected.");
      return;
    }

    setUploadFiles(prevFiles => [...prevFiles, ...newUploadFiles]);
    setProcessedImageUrls([]);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      processFiles(event.target.files);
      event.target.value = '';
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

  const handleFolderNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFolderName(event.target.value);
  };

  const handleRemoveFile = (idToRemove: string) => {
    const fileToRemove = uploadFiles.find(f => f.id === idToRemove);
    if (fileToRemove) {
      URL.revokeObjectURL(fileToRemove.previewUrl);
      setUploadFiles(prevFiles => prevFiles.filter(f => f.id !== idToRemove));
      showSuccess(`Removed file: ${fileToRemove.file.name}`);
    }
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) {
      showError("Please select at least one file first.");
      return;
    }
    if (cropAmount < 0) {
      showError("Crop amount cannot be negative.");
      return;
    }

    setIsUploadingGlobal(true);
    const successfulProcessedUrls: string[] = [];
    const totalFiles = uploadFiles.length;
    let processedCount = 0;

    const globalToastId = showLoading(`Processing 0/${totalFiles} images...`);

    for (const uploadFile of uploadFiles) {
      const fileName = `${Date.now()}-${uploadFile.file.name}`;
      const rawFilePath = fileName;

      setUploadFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...f, status: 'uploading' } : f));

      try {
        const { error: uploadError } = await supabase.storage
          .from('raw-images')
          .upload(rawFilePath, uploadFile.file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        setUploadFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...f, status: 'processing' } : f));

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
          throw new Error(`Processing failed with status ${response.status}: ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();

        if (data && data.processedImageUrl) {
          successfulProcessedUrls.push(data.processedImageUrl);
          processedCount++;
          showLoading(`Processing ${processedCount}/${totalFiles} images...`);
          setUploadFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...f, status: 'success', processedUrl: data.processedImageUrl } : f));
        } else {
          throw new Error(`No processed image URL returned.`);
        }

        const { error: deleteError } = await supabase.storage
          .from('raw-images')
          .remove([rawFilePath]);

        if (deleteError) {
          console.error(`Error deleting raw image ${uploadFile.file.name}:`, deleteError.message);
        }

      } catch (error: any) {
        console.error(`Error processing ${uploadFile.file.name}:`, error);
        setUploadFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...f, status: 'error', errorMessage: error.message } : f));
        showError(`Failed to process ${uploadFile.file.name}: ${error.message}`);
      }
    }

    setProcessedImageUrls(successfulProcessedUrls);
    dismissToast(globalToastId);
    setIsUploadingGlobal(false);
    
    setUploadFiles([]);
    if (successfulProcessedUrls.length > 0) {
      showSuccess(`Successfully processed ${successfulProcessedUrls.length} out of ${totalFiles} images!`);
    } else {
      showError("No images were successfully processed.");
    }
  };

  const handleDownloadAll = async () => {
    if (processedImageUrls.length === 0) {
      showError("No processed images to download.");
      return;
    }

    const downloadToastId = showLoading(`Preparing ${processedImageUrls.length} images for download...`);
    const zip = new JSZip();
    const folder = zip.folder(folderName || "processed_images");

    if (!folder) {
      dismissToast(downloadToastId);
      showError("Failed to create zip folder.");
      return;
    }

    let downloadCount = 0;
    for (const url of processedImageUrls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const blob = await response.blob();
        const filename = url.split('/').pop() || `processed_image_${Date.now()}.jpeg`;
        folder.file(filename, blob);
        downloadCount++;
        showLoading(`Adding ${downloadCount}/${processedImageUrls.length} images to zip...`);
      } catch (error) {
        console.error("Error adding image to zip:", error);
        showError(`Failed to add an image to the zip: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    try {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `${folderName || "processed_images"}.zip`);
      dismissToast(downloadToastId);
      showSuccess(`Successfully downloaded ${downloadCount} images as a ZIP file!`);
    } catch (error) {
      console.error("Error generating or saving zip:", error);
      dismissToast(downloadToastId);
      showError(`Failed to create or download the ZIP file: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleReset = () => {
    uploadFiles.forEach(uploadFile => URL.revokeObjectURL(uploadFile.previewUrl));
    setUploadFiles([]); 
    setProcessedImageUrls([]);
    setIsUploadingGlobal(false);
    setCropAmount(45);
    setFolderName("processed_images");
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

        <div className="grid w-full max-w-sm items-center gap-1.5">
          <label htmlFor="folder-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Download Folder Name
          </label>
          <Input 
            id="folder-name" 
            type="text" 
            value={folderName} 
            onChange={handleFolderNameChange} 
            placeholder="e.g., My Cropped Images"
          />
        </div>

        {uploadFiles.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <p>Selected files ({uploadFiles.length}):</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 max-h-40 overflow-y-auto">
              {uploadFiles.map((uploadFile) => (
                <div key={uploadFile.id} className="relative group">
                  <img src={uploadFile.previewUrl} alt={`Preview ${uploadFile.file.name}`} className="w-full h-20 object-cover rounded-md shadow-sm" />
                  <span className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate rounded-b-md">
                    {uploadFile.file.name}
                  </span>
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveFile(uploadFile.id)}
                    disabled={isUploadingGlobal}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  {uploadFile.status !== 'pending' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 rounded-md">
                      {uploadFile.status === 'uploading' || uploadFile.status === 'processing' ? (
                        <Loader2 className="h-8 w-8 text-white animate-spin" />
                      ) : uploadFile.status === 'success' ? (
                        <CheckCircle className="h-8 w-8 text-green-400" />
                      ) : (
                        <XCircle className="h-8 w-8 text-red-400" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {isUploadingGlobal && (
              <p className="text-center mt-2 text-gray-500 dark:text-gray-400">
                Processing in progress...
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleUpload} disabled={uploadFiles.length === 0 || isUploadingGlobal} className="flex-grow">
            {isUploadingGlobal ? "Processing..." : `Upload and Process ${uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''} Images`}
          </Button>
          {processedImageUrls.length > 0 && (
            <Button onClick={handleDownloadAll} disabled={isUploadingGlobal} className="flex-grow" variant="secondary">
              Download All ({processedImageUrls.length}) as ZIP
            </Button>
          )}
        </div>
        {(uploadFiles.length > 0 || processedImageUrls.length > 0) && (
          <Button onClick={handleReset} variant="outline" className="w-full">
            Reset
          </Button>
        )}
        {processedImageUrls.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2">Processed Images:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-60 overflow-y-auto">
              {processedImageUrls.map((url, index) => (
                <div key={index} className="border rounded-md p-2 flex flex-col items-center">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs break-all mb-1">
                    {`Изображение ${index + 1}`}
                  </a>
                  <img src={url} alt={`Processed ${index}`} className="max-w-full h-auto rounded-md shadow-md" />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Right-click or long-press on an image/link to save it.
            </p>
          </div>
        ) : (
          !isUploadingGlobal && uploadFiles.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              No images processed yet. Upload a PNG to get started!
            </p>
          )
        )}
        <p className="text-xs text-gray-500 mt-4">
          Note: Actual image cropping and format conversion happen on the Supabase Edge Function.
        </p>
      </CardContent>
    </Card>
  );
};

export default ImageUploader;