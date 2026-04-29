import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type QuizType = "영영" | "영한" | "한영" | "랜덤";

interface WordEntry {
  word: string;
  level: CefrLevel;
  pos: string;
}

interface DictionaryDef {
  word: string;
  definition_en: string;
  example?: string;
}

interface Question {
  word: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

// Step 1: Claude로 content words 추출 + CEFR 분류
async function extractWords(
  client: Anthropic,
  text: string,
  level: CefrLevel
): Promise<WordEntry[]> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Extract content words from the text and assign CEFR levels.

Rules:
- Include ONLY: nouns, main verbs, adjectives, adverbs with clear semantic meaning
- Exclude: articles (a/an/the), prepositions, conjunctions, pronouns, auxiliary verbs (be/have/do/will/can/should/may/must etc.)
- Include content words at ALL CEFR levels including A1/A2
- Use lemma/base form (running→run, better→good, bought→buy)
- Assign A1, A2, B1, B2, C1, or C2
- No duplicates

Return ONLY a valid JSON array with no extra text or markdown:
[{"word":"...","level":"A1","pos":"noun"}]

Text:
${text.slice(0, 8000)}`,
      },
    ],
  });

  try {
    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const all: WordEntry[] = JSON.parse(match[0]);
    return all.filter((w) => w.level === level && typeof w.word === "string");
  } catch {
    return [];
  }
}

// Step 2 (RAG): Free Dictionary API에서 실제 정의 조회
async function fetchDefinition(word: string): Promise<DictionaryDef | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meaning = data[0]?.meanings?.[0];
    const def = meaning?.definitions?.[0];
    if (!def?.definition) return null;
    return {
      word,
      definition_en: def.definition,
      example: def.example,
    };
  } catch {
    return null;
  }
}

// Step 3: 조회된 정의를 바탕으로 Claude가 문제 생성
async function generateQuestions(
  client: Anthropic,
  defs: DictionaryDef[],
  type: QuizType,
  count: number
): Promise<Question[]> {
  const wordList = defs
    .slice(0, count + 5)
    .map(
      (d) =>
        `- word: "${d.word}" | definition: "${d.definition_en}"${
          d.example ? ` | example: "${d.example}"` : ""
        }`
    )
    .join("\n");

  const typeInstruction =
    type === "영영"
      ? `Quiz type: English-English
Question: "What does '[word]' mean?" or "Which best describes '[word]'?"
Choices: 4 English definitions (1 correct, 3 plausible wrong)
Explanation: the word's meaning with a brief helpful note in English (1-2 sentences)`
      : type === "영한"
      ? `Quiz type: English-Korean
Question: "'[word]'의 뜻으로 알맞은 것은?"
Choices: 4 short Korean words or phrases, 2~5 characters each (1 correct, 3 plausible wrong). Never use full sentences.
Explanation: 한국어로 단어의 뜻과 간단한 부연 설명 (1~2문장)`
      : `Quiz type: Korean-English
Question: "[Korean meaning]을/를 뜻하는 단어는?" (use Korean meaning of the word as the question)
Choices: 4 English words of the same part of speech (1 correct, 3 plausible wrong)
Explanation: 한국어로 정답 단어의 뜻과 간단한 부연 설명 (1~2문장)`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Create exactly ${count} vocabulary quiz questions.

${typeInstruction}

Important:
- Use ONLY the provided definitions. Never invent meanings.
- Wrong answer choices must be plausible but clearly incorrect.
- Randomize the correct answer position across A/B/C/D.
- Each question must be distinct.

Words and definitions (use these):
${wordList}

Return ONLY a valid JSON array with no markdown or extra text:
[{"word":"...","question":"...","choices":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]`,
      },
    ],
  });

  try {
    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY가 .env.local에 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const { text, level, type, count = 10 } = await request.json();

    if (!text || !level || !type) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    // 1. 텍스트에서 해당 레벨 content words 추출
    const words = await extractWords(client, text, level as CefrLevel);

    if (words.length === 0) {
      return NextResponse.json(
        { error: `텍스트에 ${level} 레벨 단어가 없습니다.`, noWords: true },
        { status: 422 }
      );
    }

    // 2. RAG: 사전에서 실제 정의 조회
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    const defResults = await Promise.all(
      shuffled.slice(0, count * 2).map((w) => fetchDefinition(w.word))
    );
    const validDefs = defResults.filter(Boolean) as DictionaryDef[];

    if (validDefs.length < 2) {
      return NextResponse.json(
        { error: "사전에서 단어 정의를 가져올 수 없습니다." },
        { status: 500 }
      );
    }

    // 3. 조회된 정의 기반으로 문제 생성
    const finalCount = Math.min(count, validDefs.length);
    let questions;

    const shuffleChoices = (qs: Question[]) => qs.map(q => {
      const correct = q.choices[q.answerIndex];
      const shuffled = [...q.choices].sort(() => Math.random() - 0.5);
      return { ...q, choices: shuffled, answerIndex: shuffled.indexOf(correct) };
    });

    if (type === "랜덤") {
      const types: ("영영" | "영한" | "한영")[] = ["영영", "영한", "한영"];
      // 문제를 3등분해서 각 타입으로 생성 후 섞기
      const perType = Math.ceil(finalCount / 3);
      const shuffledDefs = [...validDefs].sort(() => Math.random() - 0.5);
      const results = await Promise.all(
        types.map((t, i) =>
          generateQuestions(client, shuffledDefs.slice(i * perType, (i + 1) * perType + 2), t, perType)
        )
      );
      questions = shuffleChoices(results.flat().sort(() => Math.random() - 0.5).slice(0, finalCount));
    } else {
      questions = shuffleChoices(await generateQuestions(client, validDefs, type as "영영" | "영한" | "한영", finalCount));
    }

    return NextResponse.json({ questions, totalWords: words.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json(
      { error: `퀴즈 생성 오류: ${message}` },
      { status: 500 }
    );
  }
}
