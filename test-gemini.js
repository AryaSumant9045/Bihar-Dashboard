require('dotenv').config();
async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: "Respond in JSON format." }] },
    contents: [{ parts: [{ text: "Write 1 sentence." }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2000,
      responseMimeType: 'application/json',
    },
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
