"use client";

import { useState } from "react";

export type QuizType =
  | "영영" | "영한" | "한영"         // 어휘
  | "빈칸" | "숙어"                  // 어구
  | "해석" | "어순" | "독해"         // 문장
  | "랜덤";                          // 전체 혼합

interface QuizSetupProps {
  onStart: (type: QuizType) => void;
  onBack: () => void;
}

const GROUPS = [
  {
    category: "어휘",
    sub: "단어 레벨별 적응형 (Level 1–6)",
    types: [
      { type: "영영" as QuizType, label: "영영", desc: "단어 → 영어 뜻" },
      { type: "영한" as QuizType, label: "영한", desc: "단어 → 한국어 뜻" },
      { type: "한영" as QuizType, label: "한영", desc: "한국어 뜻 → 단어" },
    ],
  },
  {
    category: "어구",
    sub: "표현 단위 문제",
    types: [
      { type: "빈칸" as QuizType, label: "빈칸 채우기", desc: "문장의 핵심 어구 완성" },
      { type: "숙어" as QuizType, label: "숙어·구동사", desc: "관용 표현의 의미 맞추기" },
    ],
  },
  {
    category: "문장",
    sub: "문장 단위 문제",
    types: [
      { type: "해석" as QuizType, label: "문장 해석", desc: "영문 해석 선택" },
      { type: "어순" as QuizType, label: "어순 배열", desc: "올바른 문장 완성" },
      { type: "독해" as QuizType, label: "독해", desc: "지문 이해 문제" },
    ],
  },
];

export default function QuizSetup({ onStart, onBack }: QuizSetupProps) {
  const [selected, setSelected] = useState<QuizType | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-black">문제 유형 선택</h2>
        <p className="text-sm text-gray-500 mt-0.5">풀고 싶은 유형을 선택하세요.</p>
      </div>

      {/* 전체 랜덤 */}
      <button
        onClick={() => setSelected("랜덤")}
        className={`w-full py-3 rounded-xl border-2 text-sm font-semibold transition-all duration-150 ${
          selected === "랜덤"
            ? "border-black bg-black text-white"
            : "border-gray-200 text-gray-700 hover:border-gray-400"
        }`}
      >
        전체 랜덤 — 모든 유형 혼합
      </button>

      {/* 카테고리별 */}
      {GROUPS.map((g) => (
        <div key={g.category}>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xs font-bold text-gray-700">{g.category}</span>
            <span className="text-[11px] text-gray-400">{g.sub}</span>
          </div>
          <div className={`grid gap-2 ${g.types.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {g.types.map((t) => (
              <button
                key={t.type}
                onClick={() => setSelected(t.type)}
                className={`flex flex-col items-start p-3 rounded-xl border-2 transition-all duration-150 ${
                  selected === t.type
                    ? "border-black bg-black text-white"
                    : "border-gray-200 bg-white hover:border-gray-400 text-gray-800"
                }`}
              >
                <span className="text-sm font-semibold">{t.label}</span>
                <span className={`text-[11px] mt-0.5 leading-tight ${selected === t.type ? "text-gray-300" : "text-gray-400"}`}>
                  {t.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex gap-3 pt-1">
        <button
          onClick={onBack}
          className="px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          돌아가기
        </button>
        <button
          onClick={() => selected && onStart(selected)}
          disabled={!selected}
          className="flex-1 py-3 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          퀴즈 시작
        </button>
      </div>
    </div>
  );
}
