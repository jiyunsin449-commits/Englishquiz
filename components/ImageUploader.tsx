"use client";

import { useCallback, useRef, useState } from "react";

interface FileUploaderProps {
  onImageSelect: (dataUrl: string) => void;
  onFileSelect: (file: File) => void;
}

const ACCEPTED = "image/*,.pdf,.txt,.docx";

export default function ImageUploader({ onImageSelect, onFileSelect }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const name = file.name.toLowerCase();
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => onImageSelect(e.target?.result as string);
        reader.readAsDataURL(file);
      } else if (name.endsWith(".pdf") || name.endsWith(".txt") || name.endsWith(".docx")) {
        onFileSelect(file);
      } else {
        alert("지원하지 않는 파일 형식입니다.\n이미지, PDF, TXT, DOCX 파일만 업로드할 수 있습니다.");
      }
    },
    [onImageSelect, onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);
  const handleClick = () => inputRef.current?.click();
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative flex flex-col items-center justify-center
        w-full h-72 border-2 border-dashed rounded-2xl
        cursor-pointer transition-all duration-200 select-none
        ${isDragging
          ? "border-black bg-gray-50 scale-[1.01]"
          : "border-gray-300 bg-white hover:border-black hover:bg-gray-50"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleChange}
      />

      {/* Upload Icon */}
      <div className={`mb-4 transition-transform duration-200 ${isDragging ? "scale-110" : ""}`}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="48" height="48" rx="12" fill="#F3F4F6" />
          <path
            d="M24 14L24 30M24 14L19 19M24 14L29 19"
            stroke="#6B7280"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 34H34"
            stroke="#6B7280"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <p className="text-base font-semibold text-gray-800">
        파일을 드래그하거나 클릭해서 업로드
      </p>
      <p className="mt-1.5 text-sm text-gray-400">
        이미지 (PNG, JPG) · PDF · TXT · DOCX
      </p>
    </div>
  );
}
