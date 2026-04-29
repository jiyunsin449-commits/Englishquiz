import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type Difficulty = "easy" | "medium" | "hard";

const DIFF_GUIDE: Record<Difficulty, string> = {
  easy:   "Select short, simple sentences with common vocabulary. Translation choices should differ obviously.",
  medium: "Select moderately complex sentences. Choices should have subtle errors in nuance or grammar.",
  hard:   "Select long, complex sentences with advanced structures. Choices should have very subtle differences.",
};

interface Question {
  word?: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  passage?: string;
}

function parseJSON(raw: string): Question[] {
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

function shuffleChoices(questions: Question[]): Question[] {
  return questions.map(q => {
    const correct = q.choices[q.answerIndex];
    const shuffled = [...q.choices].sort(() => Math.random() - 0.5);
    return { ...q, choices: shuffled, answerIndex: shuffled.indexOf(correct) };
  });
}

async function generateTranslation(
  client: Anthropic, text: string, count: number, difficulty: Difficulty, level: string
): Promise<Question[]> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Create ${count} sentence translation questions from the English text.

CEFR Level: ${level} — Difficulty: ${difficulty.toUpperCase()} — ${DIFF_GUIDE[difficulty]}

Level guidance for sentence selection:
- A1/A2: short simple sentences with basic vocabulary and present/past tense
- B1/B2: compound/complex sentences with subordinate clauses and varied tenses
- C1/C2: long complex sentences with advanced grammar, passive voice, conditionals, or nuanced vocabulary

Rules:
- Select sentences from the text appropriate for ${level} level
- Pick DIFFERENT sentences than you would for lower CEFR levels
- Question format: "다음 문장의 올바른 해석은?\\n[English sentence]"
- 4 Korean choices: 1 correct + 3 with errors (wrong word, tense, or nuance)
- Explanation: 정확한 해석과 오역 포인트 한 줄

Return ONLY valid JSON, no markdown:
[{"question":"다음 문장의 올바른 해석은?\\n[sentence]","choices":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]

Text:
${text.slice(0, 6000)}`,
    }],
  });
  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  const parsed = parseJSON(raw);
  if (parsed.length === 0) console.error("[해석] 파싱 실패. raw:", raw.slice(0, 300));
  return parsed;
}

async function generateWordOrder(
  client: Anthropic, text: string, count: number, difficulty: Difficulty, level: string
): Promise<Question[]> {
  const wordRange = difficulty === "easy" ? "5–7" : difficulty === "medium" ? "7–10" : "10–14";
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Create ${count} word order questions from the English text.

CEFR Level: ${level} — Difficulty: ${difficulty.toUpperCase()} — Select sentences of ${wordRange} words.

Level guidance for sentence selection:
- A1/A2: SVO basic sentences, simple tenses only
- B1/B2: sentences with prepositional phrases, relative clauses, or modal verbs
- C1/C2: sentences with inversion, complex clauses, or advanced grammatical structures

Rules:
- Select ${level}-appropriate sentences from the text; supplement from your knowledge if needed
- Pick DIFFERENT sentences than you would for lower CEFR levels
- Question format: "다음 뜻에 맞게 단어를 배열하세요.\\n뜻: [Korean translation of the sentence]\\n[ w1 / w2 / w3 / ... ]"
- 4 choices: 1 correct sentence + 3 with wrong word order
- Explanation: 어순 규칙 한 줄 설명

Return ONLY valid JSON, no markdown:
[{"question":"다음 뜻에 맞게 단어를 배열하세요.\\n뜻: [Korean]\\n[ w1 / w2 ]","choices":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]

Text:
${text.slice(0, 6000)}`,
    }],
  });
  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  return parseJSON(raw);
}

async function generateComprehension(
  client: Anthropic, text: string, count: number, difficulty: Difficulty, level: string
): Promise<Question[]> {
  const qType = difficulty === "easy"
    ? "Ask about explicit details only."
    : difficulty === "medium"
    ? "Mix detail and inference questions."
    : "Focus on inference, implied meaning, and author's purpose.";

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Create ${count} reading comprehension questions.

CEFR Level: ${level} — Difficulty: ${difficulty.toUpperCase()} — ${qType}

Level guidance for question complexity:
- A1/A2: ask about obvious explicit facts; wrong choices are clearly wrong
- B1/B2: ask about implied meaning or cause-effect; wrong choices are subtly wrong
- C1/C2: ask about author's tone, purpose, or nuanced inference; wrong choices are very close to correct

Rules:
- Select passages and write questions appropriate for ${level} level
- Write questions in Korean
- Include the relevant 2–4 sentence excerpt as "passage"
- 4 Korean choices: 1 correct + 3 wrong but plausible at this level
- Explanation in Korean

Return ONLY valid JSON, no markdown:
[{"passage":"[excerpt]","question":"[Korean question]","choices":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]

Text:
${text.slice(0, 8000)}`,
    }],
  });
  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  return parseJSON(raw);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const { text, type, difficulty = "medium", level = "B1", count = 10 } = await request.json();
    const diff = difficulty as Difficulty;
    let questions: Question[] = [];

    if (type === "해석") {
      questions = shuffleChoices(await generateTranslation(client, text, count, diff, level));
    } else if (type === "어순") {
      questions = shuffleChoices(await generateWordOrder(client, text, count, diff, level));
    } else if (type === "독해") {
      questions = shuffleChoices(await generateComprehension(client, text, count, diff, level));
    } else {
      const per = Math.ceil(count / 3);
      const [trans, order, comp] = await Promise.all([
        generateTranslation(client, text, per, diff, level),
        generateWordOrder(client, text, per, diff, level),
        generateComprehension(client, text, per, diff, level),
      ]);
      questions = shuffleChoices([...trans, ...order, ...comp].sort(() => Math.random() - 0.5).slice(0, count));
    }

    if (questions.length === 0) {
      return NextResponse.json({ error: "문제를 생성할 수 없습니다." }, { status: 422 });
    }

    return NextResponse.json({ questions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: `문제 생성 오류: ${message}` }, { status: 500 });
  }
}
