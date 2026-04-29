import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (fileName.endsWith(".txt")) {
      text = buffer.toString("utf-8");
    } else if (fileName.endsWith(".pdf")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      text = result.text;
    } else if (fileName.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return NextResponse.json(
        { error: "지원하지 않는 파일 형식입니다. PDF, TXT, DOCX만 가능합니다." },
        { status: 400 }
      );
    }

    const cleaned = text.replace(/\r\n/g, "\n").trim();

    if (!cleaned) {
      return NextResponse.json(
        { error: "파일에서 텍스트를 찾을 수 없습니다." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text: cleaned });
  } catch (error) {
    console.error("Extract error:", error);
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json(
      { error: `텍스트 추출 중 오류: ${message}` },
      { status: 500 }
    );
  }
}
