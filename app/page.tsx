"use client";

import { useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import ImageCropper from "@/components/ImageCropper";
import AnalyzingOverlay from "@/components/AnalyzingOverlay";
import TextEditor from "@/components/TextEditor";
import QuizSetup from "@/components/QuizSetup";
import QuizView from "@/components/QuizView";
import type { QuizType } from "@/components/QuizSetup";

type Step = "upload" | "crop" | "analyzing" | "extracting" | "edit" | "quiz-setup" | "quiz" | "quiz-end" | "error";

export default function Home() {
  const [step, setStep]               = useState<Step>("upload");
  const [rawImageSrc, setRawImageSrc] = useState("");
  const [analyzedText, setAnalyzedText] = useState("");
  const [quizType, setQuizType]       = useState<QuizType>("랜덤");
  const [errorMessage, setErrorMessage] = useState("");

  // 이미지 선택 → 크롭
  const handleImageSelect = (dataUrl: string) => {
    setRawImageSrc(dataUrl);
    setStep("crop");
  };

  // 파일(PDF/TXT/DOCX) 선택 → 텍스트 추출
  const handleFileSelect = async (file: File) => {
    setStep("extracting");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/extract", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.error) { setErrorMessage(data.error ?? "오류"); setStep("error"); return; }
      if (!data.text?.trim()) { setErrorMessage("파일에서 텍스트를 찾을 수 없습니다."); setStep("error"); return; }
      setAnalyzedText(data.text);
      setStep("edit");
    } catch {
      setErrorMessage("서버 연결에 실패했습니다.");
      setStep("error");
    }
  };

  // 크롭 완료 → Vision API
  const handleCropComplete = async (croppedDataUrl: string) => {
    setStep("analyzing");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: croppedDataUrl }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setErrorMessage(data.error ?? "오류"); setStep("error"); return; }
      if (!data.text?.trim()) { setErrorMessage("이미지에서 텍스트를 찾을 수 없습니다."); setStep("error"); return; }
      setAnalyzedText(data.text);
      setStep("edit");
    } catch {
      setErrorMessage("서버 연결에 실패했습니다.");
      setStep("error");
    }
  };

  const handleConfirm = (text: string) => {
    setAnalyzedText(text);
    setStep("quiz-setup");
  };

  const handleQuizStart = (type: QuizType) => {
    setQuizType(type);
    setStep("quiz");
  };

  const handleReset = () => {
    setStep("upload");
    setRawImageSrc("");
    setAnalyzedText("");
    setErrorMessage("");
  };

  // step indicator 표시용
  const displayStep =
    step === "extracting" ? "analyzing"
    : step === "quiz-setup" ? "quiz"
    : step;

  const stepDefs = [
    { key: "upload",    label: "업로드" },
    { key: "crop",      label: "자르기" },
    { key: "analyzing", label: "분석"   },
    { key: "edit",      label: "확인"   },
    { key: "quiz",      label: "퀴즈"   },
  ];
  const stepOrder = ["upload", "crop", "analyzing", "edit", "quiz", "error"];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 3h5v5H3zM10 3h5v5h-5zM3 10h5v5H3zM10 10h5v5h-5z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-black leading-none">Quiz Maker</h1>
            <p className="text-xs text-gray-400 mt-0.5">영어 텍스트 분석</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-2xl mx-auto px-6 py-10">
        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-8">
          {stepDefs.map((s, idx, arr) => {
            const currentIdx = stepOrder.indexOf(displayStep === "error" ? "edit" : displayStep);
            const sIdx       = stepOrder.indexOf(s.key);
            // 파일 플로우: 크롭은 자동 완료
            const autoComplete = (step === "extracting" || step === "edit" || step === "quiz-setup" || step === "quiz") && s.key === "crop";
            const isActive    = s.key === displayStep && !autoComplete;
            const isCompleted = autoComplete || sIdx < currentIdx;

            return (
              <div key={s.key} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${
                      isActive    ? "bg-black text-white"
                      : isCompleted ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isCompleted ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : idx + 1}
                  </div>
                  <span className={`text-xs font-medium ${isActive ? "text-black" : isCompleted ? "text-gray-600" : "text-gray-400"}`}>
                    {s.label}
                  </span>
                </div>
                {idx < arr.length - 1 && (
                  <div className={`h-px w-6 ${isCompleted ? "bg-gray-400" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="border border-gray-200 rounded-2xl p-6 shadow-sm bg-white">
          {step === "upload" && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-semibold text-black">파일 업로드</h2>
                <p className="text-sm text-gray-500 mt-0.5">영어가 포함된 이미지 또는 파일을 업로드하세요.</p>
              </div>
              <ImageUploader onImageSelect={handleImageSelect} onFileSelect={handleFileSelect} />
              <div className="flex gap-4 pt-1">
                {[
                  { icon: "🖼️", text: "이미지 (PNG, JPG)" },
                  { icon: "📄", text: "PDF 문서" },
                  { icon: "📝", text: "TXT / DOCX" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span>{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "crop" && rawImageSrc && (
            <ImageCropper imageSrc={rawImageSrc} onCropComplete={handleCropComplete} onCancel={handleReset} />
          )}

          {step === "analyzing" && (
            <AnalyzingOverlay message="이미지에서 영어 텍스트를 추출하고 있습니다..." />
          )}

          {step === "extracting" && (
            <AnalyzingOverlay message="파일에서 텍스트를 추출하고 있습니다..." />
          )}

          {step === "edit" && analyzedText && (
            <TextEditor initialText={analyzedText} onConfirm={handleConfirm} onReset={handleReset} />
          )}

          {step === "quiz-setup" && (
            <QuizSetup onStart={handleQuizStart} onBack={() => setStep("edit")} />
          )}

          {step === "quiz" && analyzedText && (
            <QuizView text={analyzedText} quizType={quizType} onExit={() => setStep("quiz-end")} />
          )}

          {step === "quiz-end" && (
            <div className="flex flex-col items-center gap-5 py-10">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M6 14l5 5 11-10" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="text-center">
                <h2 className="text-base font-semibold text-black">퀴즈 종료</h2>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => setStep("quiz-setup")}
                  className="w-full py-3 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
                >
                  새 퀴즈
                </button>
                <button
                  onClick={handleReset}
                  className="w-full py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  새 파일 업로드
                </button>
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center gap-5 py-10">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M14 9v6M14 18v1" stroke="#374151" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="14" cy="14" r="11" stroke="#374151" strokeWidth="1.5" />
                </svg>
              </div>
              <div className="text-center">
                <h2 className="text-base font-semibold text-black">분석 실패</h2>
                <p className="text-sm text-gray-500 mt-1.5 max-w-xs">{errorMessage}</p>
              </div>
              <button onClick={handleReset} className="px-6 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
                다시 시도
              </button>
            </div>
          )}
        </div>

        {/* Info */}
        {step === "upload" && (
          <div className="mt-6 flex items-start gap-3 px-4 py-3.5 bg-gray-50 rounded-xl border border-gray-100">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
              <circle cx="8" cy="8" r="6.5" stroke="#9CA3AF" strokeWidth="1" />
              <path d="M8 7v4M8 5.5V6" stroke="#9CA3AF" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <p className="text-xs text-gray-400 leading-relaxed">
              이미지는 Google Cloud Vision API로, PDF/TXT/DOCX는 서버에서 직접 텍스트를 추출합니다.
              퀴즈 생성에는 Anthropic API가 사용됩니다.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
