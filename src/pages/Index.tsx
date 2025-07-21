"use client";

import { MadeWithDyad } from "@/components/made-with-dyad";
import ImageUploader from "@/components/ImageUploader";
import React from "react";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">Photo conversion</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Upload your PNG images for cropping and conversion.
        </p>
      </div>
      <ImageUploader />
      <MadeWithDyad />
    </div>
  );
};

export default Index;