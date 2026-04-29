import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

async function getAccessToken(): Promise<string> {
  let credentials;

  // 1. 만약 환경변수(Vercel 등)에 GOOGLE_CLIENT_EMAIL과 GOOGLE_PRIVATE_KEY가 직접 설정되어 있다면 그걸 사용합니다.
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    let rawKey = process.env.GOOGLE_PRIVATE_KEY.trim();
    // 앞뒤 따옴표 제거 (따옴표와 함께 복사되었을 경우)
    rawKey = rawKey.replace(/^"|"$/g, "");
    // 이스케이프된 개행문자 지원 (JS 문자열로 '\n'이 들어올 경우)
    rawKey = rawKey.replace(/\\n/g, "\n");
    
    // 만약 Vercel 환경변수 입력 창에서 줄바꿈이 모두 공백(스페이스) 한 줄로 합쳐진 경우, 정규식으로 복구합니다.
    if (!rawKey.includes("\n") && rawKey.includes("-----BEGIN PRIVATE KEY-----")) {
      const body = rawKey
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\s+/g, ""); // 모든 공백 제거
      rawKey = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----\n`;
    }

    credentials = {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: rawKey,
    };
  // 2. 만약 GOOGLE_APPLICATION_CREDENTIALS가 로컬 파일 경로로 설정되어 있다면 파일에서 읽습니다.
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      // JSON 형태의 문자열이 직접 들어왔을 수도 있는지 체크
      const parsed = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      credentials = {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
      };
    } catch {
      // JSON 파싱에 실패하면 파일 경로로 간주하고 읽어옵니다 (로컬 개발 환경용)
      const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
    }
  } else {
    throw new Error("Google Cloud 인증 정보가 .env 파일에 설정되지 않았습니다.");
  }


  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-vision",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Sign with RS256 using the private key
  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(credentials.private_key, "base64url");

  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.json();
    throw new Error(`토큰 발급 실패: ${err.error_description || err.error}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64 } = await request.json();

    if (!imageBase64) {
      return NextResponse.json(
        { error: "이미지 데이터가 없습니다." },
        { status: 400 }
      );
    }

    const accessToken = await getAccessToken();

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const response = await fetch(
      "https://vision.googleapis.com/v1/images:annotate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Data },
              features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: `Vision API 오류: ${errorData.error?.message || "알 수 없는 오류"}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const textAnnotations = data.responses?.[0]?.textAnnotations;

    if (!textAnnotations || textAnnotations.length === 0) {
      return NextResponse.json({ text: "" });
    }

    const fullText = textAnnotations[0].description || "";
    return NextResponse.json({ text: fullText });
  } catch (error) {
    console.error("Vision API error:", error);
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json(
      { error: `텍스트 분석 중 오류: ${message}` },
      { status: 500 }
    );
  }
}
