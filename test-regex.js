const text1 = '```json\n{\n  "a": 1\n}\n```';
let t = text1.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
console.log('Test 1:', JSON.stringify(t), t.indexOf('{'), t.lastIndexOf('}'));

const text2 = '{\n  "a": 1\n}';
t = text2.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
console.log('Test 2:', JSON.stringify(t), t.indexOf('{'), t.lastIndexOf('}'));
