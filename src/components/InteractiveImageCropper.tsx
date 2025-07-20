"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactCrop, {
  centerCrop,
  makeCrop,
  PixelCrop,
  Crop as ReactCropType,
} from "react-image-crop";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";
import "react-image-crop/dist/ReactCrop.css"; // Corrected import path

interface InteractiveImageCropperProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageOriginalName: string;
  imageProcessedPath: string;
  onImageCropped: (croppedImageUrl: string, originalName: string, newPath: string) => void;
}

// Helper function to center a crop
function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
) {
  return centerCrop(
    makeCrop({
      unit: '%',
      width: 90,
    }),
    mediaWidth,
    mediaHeight,
    aspect,
  );
}

const InteractiveImageCropper = ({
  isOpen,
  onClose,
  imageUrl,
  imageOriginalName,
  imageProcessedPath,
  onImageCropped,
}: InteractiveImageCropperProps) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<ReactCropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(undefined); // No fixed aspect ratio initially

  useEffect(() => {
    if (isOpen && imageUrl) {
      // Reset crop when dialog opens or image changes
      setCrop(undefined);
      setCompletedCrop(undefined);
      setScale(1);
      setRotate(0);
      setAspect(undefined);
    }
  }, [isOpen, imageUrl]);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, aspect || 16 / 9)); // Default to 16:9 if no aspect
  };

  const onCropComplete = (crop: PixelCrop) => {
    setCompletedCrop(crop);
  };

  const getCroppedImageBlob = async (
    image: HTMLImageElement,
    crop: PixelCrop,
    scale = 1,
    rotate = 0,
  ): Promise<Blob | null> => {
    const canvas = previewCanvasRef.current;
    if (!canvas) {
      throw new Error('Crop canvas not found');
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No 2d context');
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const pixelRatio = window.devicePixelRatio;
    canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
    canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

    ctx.scale(pixelRatio, pixelRatio);
    ctx.imageSmoothingQuality = 'high';

    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;

    const rotateRads = rotate * Math.PI / 180;
    const centerX = image.naturalWidth / 2;
    const centerY = image.naturalHeight / 2;

    ctx.save();

    ctx.translate(-cropX, -cropY);
    ctx.translate(centerX, centerY);
    ctx.rotate(rotateRads);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);
    ctx.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
    );

    ctx.restore();

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.95); // Convert to JPEG with 95% quality
    });
  };

  const handleSaveCroppedImage = async () => {
    if (!completedCrop || !imgRef.current) {
      showError("Please select a crop area first.");
      return;
    }

    const toastId = showLoading("Saving cropped image...");

    try {
      const croppedBlob = await getCroppedImageBlob(
        imgRef.current,
        completedCrop,
        scale,
        rotate,
      );

      if (!croppedBlob) {
        throw new Error("Failed to create cropped image blob.");
      }

      // Generate a new file name for the cropped image
      const originalFileNameWithoutExt = imageOriginalName.split('.').slice(0, -1).join('.');
      const newFileName = `${originalFileNameWithoutExt}_cropped_${Date.now()}.jpeg`;
      const newFilePath = `processed/${newFileName}`;

      const { data, error } = await supabase.storage
        .from('images')
        .upload(newFilePath, croppedBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from('images')
        .getPublicUrl(newFilePath);

      showSuccess("Image cropped and saved successfully!");
      onImageCropped(publicUrlData.publicUrl, newFileName, newFilePath);
      onClose(); // Close the dialog after successful save
    } catch (error: any) {
      console.error("Error saving cropped image:", error);
      showError(`Failed to save cropped image: ${error.message}`);
    } finally {
      dismissToast(toastId);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full p-6">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
          <DialogDescription>
            Drag to select the area you want to keep.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-4">
          {imageUrl && (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={onCropComplete}
              aspect={aspect}
              minWidth={100}
              minHeight={100}
            >
              <img
                ref={imgRef}
                alt="Crop"
                src={imageUrl}
                onLoad={onImageLoad}
                style={{ transform: `scale(${scale}) rotate(${rotate}deg)` }}
                className="max-w-full h-auto"
              />
            </ReactCrop>
          )}
          {completedCrop && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">Preview</h3>
              <canvas
                ref={previewCanvasRef}
                style={{
                  width: completedCrop.width,
                  height: completedCrop.height,
                  objectFit: "contain",
                  border: "1px solid #ccc",
                }}
              />
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSaveCroppedImage} disabled={!completedCrop}>
            Save Cropped Image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InteractiveImageCropper;