"use client";

import { MadeWithDyad } from "@/components/made-with-dyad";
import ImageUploader from "@/components/ImageUploader";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess, showLoading, dismissToast } from "@/utils/toast";
import { Download } from "lucide-react";

interface ProcessedImage {
  originalName: string;
  processedUrl: string;
  processedPath: string;
}

const Index = () => {
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);

  const handleImagesProcessed = (images: ProcessedImage[]) => {
    setProcessedImages(images);
  };

  const handleDownloadAll = async () => {
    if (processedImages.length === 0) {
      showError("No images to download.");
      return;
    }

    const toastId = showLoading("Preparing ZIP archive for download...");

    try {
      const imagePaths = processedImages.map(img => img.processedPath);
      const { data: zipResult, error: zipError } = await supabase.functions.invoke('create-zip', {
        body: { imagePaths },
        headers: { 'Content-Type': 'application/json' },
      });

      if (zipError) {
        throw zipError;
      }

      if (zipResult && zipResult.zipUrl) {
        const link = document.createElement('a');
        link.href = zipResult.zipUrl;
        link.setAttribute('download', 'processed_images.zip');
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
      dismissToast(toastId);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">Image Processing App</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Upload your PNG images for automatic cropping and conversion.
        </p>
      </div>
      <ImageUploader onImagesProcessed={handleImagesProcessed} />

      {processedImages.length > 0 && (
        <Card className="w-full max-w-md mx-auto mt-8">
          <CardHeader>
            <CardTitle>Processed Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {processedImages.map((image, index) => (
                <div key={index} className="flex flex-col items-center">
                  <img src={image.processedUrl} alt={image.originalName} className="max-w-full h-auto rounded-md shadow-md" />
                  <p className="text-sm text-center mt-2">{image.originalName.split('.')[0]}.jpeg</p>
                </div>
              ))}
            </div>
            <Button onClick={handleDownloadAll} className="w-full">
              <Download className="mr-2 h-4 w-4" /> Download All as ZIP
            </Button>
          </CardContent>
        </Card>
      )}

      <MadeWithDyad />
    </div>
  );
};

export default Index;