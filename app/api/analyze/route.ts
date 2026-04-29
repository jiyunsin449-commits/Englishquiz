import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

async function getAccessToken(): Promise<string> {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS 환경변수가 설정되지 않았습니다.");
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));

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
