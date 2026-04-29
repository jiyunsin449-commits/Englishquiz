"use client";

interface AnalyzingOverlayProps {
  message?: string;
}

export default function AnalyzingOverlay({ message = "이미지에서 영어 텍스트를 추출하고 있습니다..." }: AnalyzingOverlayProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      {/* Spinner */}
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-black animate-spin" />
      </div>

      {/* Text */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-lg font-semibold text-black animate-pulse">
          분석 중
        </p>
        <p className="text-sm text-gray-400">{message}</p>
      </div>

      {/* Dots animation */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-gray-300"
            style={{
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
