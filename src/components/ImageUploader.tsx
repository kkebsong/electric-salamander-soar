"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";

const ImageUploader = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
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

    // Simulate API call to a backend for image processing and upload
    // In a real application, you would send `selectedFile` to your server here.
    // Example:
    // const formData = new FormData();
    // formData.append('image', selectedFile);
    // try {
    //   const response = await fetch('/api/upload-and-process', {
    //     method: 'POST',
    //     body: formData,
    //   });
    //   if (!response.ok) throw new Error('Upload failed');
    //   const result = await response.json();
    //   console.log('Upload successful:', result);
    //   showSuccess('Image processed and uploaded successfully!');
    // } catch (error) {
    //   console.error('Upload error:', error);
    //   showError('Failed to process and upload image.');
    // } finally {
    //   dismissToast(toastId);
    // }

    // Simulating a delay for the "upload"
    await new Promise((resolve) => setTimeout(resolve, 2000));

    dismissToast(toastId);
    showSuccess(`Successfully "uploaded" and "processed" ${selectedFile.name}!`);
    setSelectedFile(null); // Clear selected file after "upload"
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
        <p className="text-xs text-gray-500 mt-4">
          Note: Image processing and actual file storage require a backend server.
          This demonstration simulates the client-side interaction.
        </p>
      </CardContent>
    </Card>
  );
};

export default ImageUploader;