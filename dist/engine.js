// Browser-only extractive demo. Never presented as output of a neural model.
export const MAX_CHARS = 200000;
export const cleanText = text => text.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim();
export const syllables = text => (text.normalize('NFC').toLocaleLowerCase('vi').match(/[\p{L}\p{N}_]+/gu) || []);
export const wordCount = text => text.trim() ? text.trim().split(/\s+/u).length : 0;
const stopwords = new Set('và là của có trong một các được cho với đã những này đó về từ tại đến sẽ cũng như để khi theo hơn người không đang vào ra trên thì'.split(' '));
export function extractiveSummary(raw, { maxSentences = 3 } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Hãy nhập nội dung bài báo tiếng Việt.');
  if (raw.length > MAX_CHARS) throw new Error('Bài báo vượt 200.000 ký tự. Hãy rút ngắn nội dung.');
  if (!Number.isInteger(maxSentences) || maxSentences < 1 || maxSentences > 5) throw new Error('Số câu trích xuất cần từ 1 đến 5.');
  const text = cleanText(raw);
  if (!syllables(text).length) throw new Error('Nội dung cần có chữ hoặc số để tóm tắt.');
  const allSentences = text.match(/[^.!?…]+(?:[.!?…]+[”"’']*|$)/gu) || [text];
  const sentences = allSentences.map(s => s.trim()).filter(Boolean);
  // Bound work on pathological inputs while preserving complete sentences.
  const considered = sentences.slice(0, 500);
  const tokens = considered.map(syllables);
  const frequency = new Map();
  for (const words of tokens) for (const word of words) if (!stopwords.has(word)) frequency.set(word, (frequency.get(word) || 0) + 1);
  const ranked = tokens.map((words, index) => {
    const score = words.reduce((sum, w) => sum + (stopwords.has(w) ? 0 : Math.log1p(frequency.get(w) || 0)), 0) / Math.sqrt(Math.max(words.length, 1));
    return { index, score: score * (index === 0 ? 1.25 : 1), words: new Set(words) };
  });
  ranked.sort((a,b) => b.score - a.score || a.index - b.index);
  const target = Math.min(maxSentences, Math.max(1, Math.ceil(considered.length * .25)));
  const picked = [];
  for (const candidate of ranked) {
    if (picked.every(other => {
      const intersection = [...candidate.words].filter(w => other.words.has(w)).length;
      return intersection / Math.max(1, candidate.words.size + other.words.size - intersection) < .8;
    })) picked.push(candidate);
    if (picked.length >= target) break;
  }
  const summary = picked.sort((a,b) => a.index-b.index).map(x => considered[x.index]).join(' ');
  return { summary, selected_sentences: picked.map(x => ({ index: x.index + 1, text: considered[x.index] })), sentences_selected: picked.length, sentences_total: sentences.length, truncated: sentences.length > 500, input_tokens: null, model: 'extractive', label: 'Trích xuất câu', warnings: ['Kết quả trích xuất câu để thử giao diện; không phải đầu ra mT5/ViT5.', ...(sentences.length > 500 ? ['Chế độ thử chỉ xét 500 câu đầu.'] : [])] };
}
const ngrams = (tokens, n) => {
  const counts = new Map();
  for (let i=0; i<=tokens.length-n; i++) { const gram = tokens.slice(i,i+n).join('\0'); counts.set(gram,(counts.get(gram)||0)+1); }
  return counts;
};
const f1 = (overlap, p, r) => p && r ? 200*overlap/(p+r) : 0;
export function rouge(prediction, reference) {
  const p=syllables(prediction), r=syllables(reference);
  if (p.length > 1000 || r.length > 1000) throw new Error('Để tính ROUGE trên trình duyệt, mỗi bản tóm tắt cần tối đa 1.000 âm tiết.');
  const result = {};
  for(const n of [1,2]) {
    const pc=ngrams(p,n),rc=ngrams(r,n);
    let overlap=0;for(const [gram,count] of pc) overlap+=Math.min(count,rc.get(gram)||0);
    result['rouge'+n]=f1(overlap,Math.max(0,p.length-n+1),Math.max(0,r.length-n+1));
  }
  let prev=new Uint16Array(r.length+1);
  for(const token of p){const next=new Uint16Array(r.length+1);for(let j=1;j<=r.length;j++)next[j]=token===r[j-1]?prev[j-1]+1:Math.max(prev[j],next[j-1]);prev=next;}
  result.rougeL=f1(prev[r.length],p.length,r.length);
  return result;
}

export function newNumberStrings(prediction, source) {
  const original = new Set(source.match(/\d+/g) || []);
  return [...new Set(prediction.match(/\d+/g) || [])].filter(number => !original.has(number));
}
