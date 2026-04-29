import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type Difficulty = "easy" | "medium" | "hard";

const DIFF_GUIDE: Record<Difficulty, string> = {
  easy:   "Use short, simple sentences. Blank very common phrases (2–3 words). Expressions should be everyday and obvious.",
  medium: "Use moderately complex sentences. Include less common phrasal verbs and collocations.",
  hard:   "Use long, complex sentences with advanced grammar. Include subtle idioms and sophisticated fixed expressions.",
};

interface Question {
  word?: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
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

async function generateFillBlank(
  client: Anthropic, text: string, count: number, difficulty: Difficulty, level: string
): Promise<Question[]> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Create ${count} fill-in-the-blank questions from the English text below.

CEFR Level: ${level} — Difficulty: ${difficulty.toUpperCase()} — ${DIFF_GUIDE[difficulty]}

Level guidance for phrase selection:
- A1/A2: blank very common collocations and simple phrases
- B1/B2: blank intermediate collocations, phrasal verbs, and fixed expressions
- C1/C2: blank advanced collocations, nuanced expressions, and sophisticated fixed phrases

Rules:
- Pick sentences from the text that contain ${level}-appropriate key phrases
- Blank out a KEY PHRASE (2–4 words) that is central to the meaning, replace with ___
- Choose a DIFFERENT set of sentences/phrases than you would for a lower CEFR level
- 4 choices: 1 correct (original phrase) + 3 plausible but wrong phrases of the same grammatical role
- Explanation in Korean: what the phrase means and why it fits the context

Return ONLY valid JSON, no markdown:
[{"word":"[blanked phrase]","question":"[sentence with ___]","choices":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]

Text:
${text.slice(0, 6000)}`,
    }],
  });
  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  return parseJSON(raw);
}

async function generateIdiom(
  client: Anthropic, text: string, count: number, difficulty: Difficulty, level: string
): Promise<Question[]> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Create ${count} idiom/phrasal verb questions based on the English text below.

CEFR Level: ${level} — Difficulty: ${difficulty.toUpperCase()} — ${DIFF_GUIDE[difficulty]}

Level guidance for expression selection:
- A1/A2: only the most basic phrasal verbs (get up, look at, come back, put on)
- B1/B2: intermediate phrasal verbs and common idioms (give up, look forward to, break down, keep in mind)
- C1/C2: sophisticated idioms and less common expressions (beat around the bush, come to terms with, go out on a limb)

Rules:
- Use the text as context/topic, but select expressions appropriate for ${level} level
- If the text lacks enough ${level}-level expressions, supplement freely from your knowledge
- Do NOT repeat expressions that would be used at lower CEFR levels
- Question: "'[expression]'의 의미로 알맞은 것은?"
- Choices: 4 short Korean meanings (1 correct, 3 wrong)
- Explanation in Korean: meaning + usage context

Return ONLY valid JSON, no markdown:
[{"word":"[expression]","question":"'[expression]'의 의미로 알맞은 것은?","choices":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]

Text:
${text.slice(0, 6000)}`,
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

    if (type === "빈칸") {
      questions = shuffleChoices(await generateFillBlank(client, text, count, diff, level));
    } else if (type === "숙어") {
      questions = shuffleChoices(await generateIdiom(client, text, count, diff, level));
    } else {
      const half = Math.ceil(count / 2);
      const [fill, idiom] = await Promise.all([
        generateFillBlank(client, text, half, diff, level),
        generateIdiom(client, text, half, diff, level),
      ]);
      questions = shuffleChoices([...fill, ...idiom].sort(() => Math.random() - 0.5).slice(0, count));
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
