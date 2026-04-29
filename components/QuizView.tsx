"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { QuizType } from "./QuizSetup";

type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

interface Question {
  word?: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  passage?: string;
}

interface QuizViewProps {
  text: string;
  quizType: QuizType;
  onExit: () => void;
}

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const LEVEL_START = 2; // B1
const LEVEL_UP = 3;
const LEVEL_DOWN = 3;

const LEVEL_BAR: Record<CefrLevel, string> = {
  A1: "bg-gray-400", A2: "bg-purple-400",
  B1: "bg-blue-500", B2: "bg-green-500",
  C1: "bg-orange-500", C2: "bg-red-500",
};

const VOCAB_TYPES: QuizType[] = ["영영", "영한", "한영"];
const isVocab = (t: QuizType) => VOCAB_TYPES.includes(t);

// levelIndex → difficulty 변환 (0–1: easy, 2–3: medium, 4–5: hard)
function toDifficulty(idx: number): "easy" | "medium" | "hard" {
  if (idx <= 1) return "easy";
  if (idx <= 3) return "medium";
  return "hard";
}

// 어순 배열 문제 감지 & 파싱
function isWordOrderQ(q: Question) {
  return q.question.includes("[ ") && q.question.includes(" / ");
}
function parseWordBank(q: Question): string[] {
  const match = q.question.match(/\[([^\]]+)\]/);
  if (!match) return [];
  return match[1].split(" / ").map(w => w.trim()).filter(Boolean);
}
function stripWordList(question: string) {
  return question.replace(/\n?\[.+\]/, "").trim();
}

export default function QuizView({ text, quizType, onExit }: QuizViewProps) {
  const [levelIndex, setLevelIndex]             = useState(LEVEL_START);
  const [questions, setQuestions]               = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx]             = useState(0);
  const [correctStreak, setCorrectStreak]       = useState(0);
  const [consecutiveWrong, setConsecutiveWrong] = useState(0);
  const [totalCorrect, setTotalCorrect]         = useState(0);
  const [totalAnswered, setTotalAnswered]       = useState(0);
  const [selected, setSelected]                 = useState<number | null>(null);
  const [isLoading, setIsLoading]               = useState(true);
  const [errorMsg, setErrorMsg]                 = useState("");
  const [levelBanner, setLevelBanner]           = useState<"up" | "down" | null>(null);
  const [wordBank, setWordBank]                 = useState<string[]>([]);
  const [wordArranged, setWordArranged]         = useState<string[]>([]);

  const mounted = useRef(false);

  const fetchQuestions = useCallback(async (levelIdx: number) => {
    setIsLoading(true);
    setErrorMsg("");
    const level = LEVELS[levelIdx];
    const difficulty = toDifficulty(levelIdx);

    try {
      let questions: Question[] = [];

      if (quizType === "랜덤") {
        const vocabTypes = ["영영", "영한", "한영"] as const;
        const randVocab = vocabTypes[Math.floor(Math.random() * 3)];
        const [vRes, pRes, sRes] = await Promise.all([
          fetch("/api/quiz/generate", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, level, type: randVocab, count: 4 }),
          }),
          fetch("/api/quiz/phrase", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, type: "랜덤", difficulty, level, count: 3 }),
          }),
          fetch("/api/quiz/sentence", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, type: "랜덤", difficulty, level, count: 3 }),
          }),
        ]);
        const [vData, pData, sData] = await Promise.all([vRes.json(), pRes.json(), sRes.json()]);
        questions = [
          ...(vData.questions ?? []),
          ...(pData.questions ?? []),
          ...(sData.questions ?? []),
        ].sort(() => Math.random() - 0.5);

      } else if (isVocab(quizType)) {
        const res = await fetch("/api/quiz/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, level, type: quizType, count: 10 }),
        });
        const data = await res.json();
        if (!res.ok || data.error) { setErrorMsg(data.error ?? "문제 생성 실패"); return; }
        questions = data.questions ?? [];

      } else if (["빈칸", "숙어"].includes(quizType)) {
        const res = await fetch("/api/quiz/phrase", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, type: quizType, difficulty, level, count: 10 }),
        });
        const data = await res.json();
        if (!res.ok || data.error) { setErrorMsg(data.error ?? "문제 생성 실패"); return; }
        questions = data.questions ?? [];

      } else {
        const res = await fetch("/api/quiz/sentence", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, type: quizType, difficulty, level, count: 10 }),
        });
        const data = await res.json();
        if (!res.ok || data.error) { setErrorMsg(data.error ?? "문제 생성 실패"); return; }
        questions = data.questions ?? [];
      }

      if (questions.length === 0) { setErrorMsg("문제를 생성할 수 없습니다."); return; }
      setQuestions(questions);
      setCurrentIdx(0);
      setSelected(null);

    } catch {
      setErrorMsg("서버 연결에 실패했습니다.");
    } finally {
      setIsLoading(false);
      setLevelBanner(null);
    }
  }, [text, quizType]);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    fetchQuestions(LEVEL_START);
  }, [fetchQuestions]);

  // 어순 문제로 넘어올 때 단어 뱅크 초기화
  useEffect(() => {
    const q = questions[currentIdx];
    if (!q || !isWordOrderQ(q)) return;
    const words = parseWordBank(q);
    // 정답 첫 단어는 대문자로 표시 (문장 시작 힌트)
    const firstWord = q.choices[q.answerIndex].split(" ")[0];
    let capped = false;
    const capitalized = words.map(w => {
      if (!capped && w.toLowerCase() === firstWord.toLowerCase()) {
        capped = true;
        return firstWord;
      }
      return w;
    });
    setWordBank([...capitalized].sort(() => Math.random() - 0.5));
    setWordArranged([]);
  }, [currentIdx, questions]);

  const handleAnswer = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
  };

  const handleWordChipClick = (i: number) => {
    const word = wordBank[i];
    setWordBank(prev => prev.filter((_, j) => j !== i));
    setWordArranged(prev => [...prev, word]);
  };

  const handleArrangedChipClick = (i: number) => {
    const word = wordArranged[i];
    setWordArranged(prev => prev.filter((_, j) => j !== i));
    setWordBank(prev => [...prev, word]);
  };

  const handleWordOrderSubmit = () => {
    const q = questions[currentIdx];
    if (!q) return;
    const normalize = (s: string) => s.toLowerCase().replace(/[.!?,;]+$/, "").trim();
    const userAnswer = wordArranged.join(" ");
    if (normalize(userAnswer) === normalize(q.choices[q.answerIndex])) {
      setSelected(q.answerIndex);
    } else {
      setSelected(q.answerIndex === 0 ? 1 : 0);
    }
  };

  const handleNext = () => {
    if (selected === null || !questions[currentIdx]) return;

    const isCorrect = selected === questions[currentIdx].answerIndex;
    setTotalCorrect((c) => (isCorrect ? c + 1 : c));
    setTotalAnswered((c) => c + 1);

    const newStreak = isCorrect ? correctStreak + 1 : Math.max(0, correctStreak - 1);
    const newWrong  = isCorrect ? 0 : consecutiveWrong + 1;

    if (newStreak >= LEVEL_UP && levelIndex < LEVELS.length - 1) {
      const next = levelIndex + 1;
      setLevelIndex(next); setCorrectStreak(0); setConsecutiveWrong(0);
      setLevelBanner("up"); fetchQuestions(next); return;
    }
    if (newWrong >= LEVEL_DOWN && levelIndex > 0) {
      const prev = levelIndex - 1;
      setLevelIndex(prev); setCorrectStreak(0); setConsecutiveWrong(0);
      setLevelBanner("down"); fetchQuestions(prev); return;
    }
    setCorrectStreak(newStreak);
    setConsecutiveWrong(newWrong);

    if (currentIdx + 1 >= questions.length) {
      fetchQuestions(levelIndex);
    } else {
      setCurrentIdx((i) => i + 1);
      setSelected(null);
    }
  };

  const q = questions[currentIdx];
  const currentLevel = LEVELS[levelIndex];
  const isCorrect = selected !== null && q && selected === q.answerIndex;

  // ─── 로딩 ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        {levelBanner && (
          <div className={`px-4 py-1.5 rounded-full text-sm font-bold ${
            levelBanner === "up" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
          }`}>
            {levelBanner === "up" ? "▲ 레벨 업!" : "▼ 레벨 다운"}
          </div>
        )}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-black animate-spin" />
        </div>
        <p className="text-sm text-gray-500">문제 생성 중...</p>
      </div>
    );
  }

  // ─── 오류 ────────────────────────────────────────────────
  if (errorMsg) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-sm text-gray-500 max-w-xs">{errorMsg}</p>
        <div className="flex gap-3">
          <button onClick={() => fetchQuestions(levelIndex)}
            className="px-5 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800">
            다시 시도
          </button>
          <button onClick={onExit}
            className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
            종료
          </button>
        </div>
      </div>
    );
  }

  if (!q) return null;

  // ─── 퀴즈 ────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-700">
            Level {levelIndex + 1}
          </span>
          <span className="text-xs text-gray-400">{totalCorrect} / {totalAnswered} 정답</span>
        </div>
        <button onClick={onExit}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors">
          퀴즈 종료
        </button>
      </div>

      {/* 레벨 진행 바 */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center text-[11px] text-gray-400">
          <span>
            연속 정답&nbsp;<span className="font-semibold text-gray-600">{correctStreak}</span>
            &nbsp;/ {LEVEL_UP}{levelIndex < LEVELS.length - 1 && " → 레벨업"}
          </span>
          {consecutiveWrong > 0 && levelIndex > 0 && (
            <span className="text-red-400">
              연속 오답&nbsp;<span className="font-semibold">{consecutiveWrong}</span>
              &nbsp;/ {LEVEL_DOWN} → 레벨다운
            </span>
          )}
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${LEVEL_BAR[currentLevel]}`}
            style={{ width: `${(correctStreak / LEVEL_UP) * 100}%` }} />
        </div>
      </div>

      {/* 지문 (독해 전용) */}
      {q.passage && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <p className="text-[11px] font-semibold text-blue-500 mb-1">지문</p>
          <p className="text-sm text-gray-700 leading-relaxed">{q.passage}</p>
        </div>
      )}

      {/* 문제 */}
      <div className="bg-gray-50 rounded-xl px-5 py-4">
        <p className="text-sm font-medium text-black leading-relaxed whitespace-pre-line">
          {isWordOrderQ(q) ? stripWordList(q.question) : q.question}
        </p>
      </div>

      {/* 보기 — 어순: 칩 UI / 나머지: 객관식 */}
      {isWordOrderQ(q) ? (
        selected === null ? (
          <div className="flex flex-col gap-3">
            {/* 배열 영역 */}
            <div className="min-h-14 border-2 border-dashed border-gray-300 rounded-xl p-3 flex flex-wrap gap-2 items-center">
              {wordArranged.length === 0 ? (
                <span className="text-xs text-gray-400">단어를 클릭해서 순서대로 배열하세요</span>
              ) : (
                wordArranged.map((word, i) => (
                  <button key={i} onClick={() => handleArrangedChipClick(i)}
                    className="px-3 py-1.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
                    {word}
                  </button>
                ))
              )}
            </div>
            {/* 단어 뱅크 */}
            <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl min-h-14 items-center">
              {wordBank.map((word, i) => (
                <button key={i} onClick={() => handleWordChipClick(i)}
                  className="px-3 py-1.5 border-2 border-gray-200 bg-white rounded-lg text-sm font-medium hover:border-gray-400 transition-colors">
                  {word}
                </button>
              ))}
            </div>
            {/* 확인 버튼 — 단어 뱅크 소진 시 */}
            {wordBank.length === 0 && wordArranged.length > 0 && (
              <button onClick={handleWordOrderSubmit}
                className="w-full py-3 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">
                확인
              </button>
            )}
          </div>
        ) : (
          /* 어순 결과 표시 */
          <div className="flex flex-col gap-2">
            <div className={`px-4 py-3 rounded-xl border-2 text-sm ${
              isCorrect ? "border-green-500 bg-green-50 text-green-800" : "border-red-400 bg-red-50 text-red-800"
            }`}>
              <span className="text-xs font-semibold mr-1">내 답:</span>{wordArranged.join(" ")}
            </div>
            {!isCorrect && (
              <div className="px-4 py-3 rounded-xl border-2 border-green-500 bg-green-50 text-green-800 text-sm">
                <span className="text-xs font-semibold mr-1">정답:</span>{q.choices[q.answerIndex]}
              </div>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {q.choices.map((choice, idx) => {
            const isChosen = selected === idx;
            const isAnswer = idx === q.answerIndex;
            let cls = "border-gray-200 bg-white text-gray-800 hover:border-gray-400";
            if (selected !== null) {
              if (isAnswer)      cls = "border-green-500 bg-green-50 text-green-800";
              else if (isChosen) cls = "border-red-400 bg-red-50 text-red-800";
              else               cls = "border-gray-100 bg-gray-50 text-gray-400";
            }
            return (
              <button key={idx} onClick={() => handleAnswer(idx)} disabled={selected !== null}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all duration-150 ${cls}`}>
                <span className="font-semibold mr-2 text-xs">{["A", "B", "C", "D"][idx]}.</span>
                {choice}
              </button>
            );
          })}
        </div>
      )}

      {/* 피드백 */}
      {selected !== null && (
        <div className="flex flex-col gap-3">
          <div className={`px-4 py-3 rounded-xl text-xs ${
            isCorrect ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
          }`}>
            <p className={`font-bold mb-1 ${isCorrect ? "text-green-700" : "text-red-600"}`}>
              {isCorrect ? "정답!" : "오답"}
            </p>
            <p className="text-gray-600 leading-relaxed">{q.explanation}</p>
          </div>
          <button onClick={handleNext}
            className="w-full py-3 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">
            다음 문제
          </button>
        </div>
      )}
    </div>
  );
}
