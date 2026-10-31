import { MAX_CHARS } from './engine.js';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 500;
class ImportError extends Error {}
let mammothPromise;

function loadMammoth() {
  if (!mammothPromise) {
    mammothPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./vendor/mammoth/mammoth.browser.min.js', import.meta.url).href;
      script.onload = () => resolve(window.mammoth);
      script.onerror = () => {
        script.remove(); mammothPromise = null;
        reject(new ImportError('Không tải được bộ đọc Word. Hãy tải lại trang và thử lại.'));
      };
      document.head.append(script);
    });
  }
  return mammothPromise;
}

function validateText(text, emptyMessage) {
  const value = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').normalize('NFC').trim();
  if (!value) throw new ImportError(emptyMessage);
  if (value.length > MAX_CHARS) throw new ImportError('Nội dung tệp vượt 200.000 ký tự. Hãy chia nhỏ tài liệu trước khi tải lên.');
  return value;
}

// Preserve line breaks and avoid inserting spaces inside adjacent PDF text runs.
export function pdfPageText(items) {
  let text = '', previous = null;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    if (previous && !/\s$/.test(text) && !/^\s/.test(item.str)) {
      const height = Math.max(Math.abs(item.transform[3]), Math.abs(previous.transform[3]), 1);
      const newLine = Math.abs(item.transform[5] - previous.transform[5]) > height * .5;
      const gap = item.transform[4] - (previous.transform[4] + previous.width);
      text += newLine ? '\n' : gap > height * .08 ? ' ' : '';
    }
    text += item.str;
    if (item.hasEOL) text += '\n';
    previous = item;
  }
  return text.trim();
}

async function readPdf(file, onProgress) {
  const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
    isEvalSupported: false, useWasm: false,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PAGES) throw new ImportError('PDF vượt 500 trang. Hãy chia nhỏ tài liệu trước khi tải lên.');
    const pages = [];
    let length = 0, emptyPages = 0;
    for (let index = 1; index <= pdf.numPages; index++) {
      onProgress(`Đang đọc PDF · trang ${index}/${pdf.numPages}…`);
      const page = await pdf.getPage(index);
      try {
        const content = await page.getTextContent();
        const text = pdfPageText(content.items);
        if (!text.trim()) emptyPages++;
        length += text.length + (index > 1 ? 2 : 0);
        if (length > MAX_CHARS) throw new ImportError('Nội dung PDF vượt 200.000 ký tự. Hãy chia nhỏ tài liệu trước khi tải lên.');
        pages.push(text);
      } finally { page.cleanup(); }
    }
    return {
      text: validateText(pages.join('\n\n'), 'Không tìm thấy chữ trong PDF. Nếu đây là bản scan hoặc ảnh chụp, hãy nhận dạng chữ (OCR) rồi tải lại.'),
      note: `${pdf.numPages} trang${emptyPages ? ` · ${emptyPages} trang không có chữ đọc được; hãy kiểm tra trang trắng hoặc ảnh scan` : ''}`,
    };
  } finally { await task.destroy(); }
}

export async function readDocument(file, onProgress = () => {}) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'doc') throw new ImportError('Tệp .doc cũ chưa được hỗ trợ. Hãy mở bằng Word, lưu thành .docx rồi tải lại.');
  if (!['txt', 'pdf', 'docx'].includes(extension)) throw new ImportError('Hãy chọn tệp TXT (.txt), PDF (.pdf) hoặc Word (.docx).');
  if (file.size > MAX_BYTES) throw new ImportError('Tệp vượt 20 MB. Hãy chia nhỏ tài liệu trước khi tải lên.');
  onProgress(`Đang đọc ${file.name}…`);
  try {
    if (extension === 'pdf') return await readPdf(file, onProgress);
    let text;
    if (extension === 'docx') {
      const mammoth = await loadMammoth();
      const result = await mammoth.extractRawText({arrayBuffer: await file.arrayBuffer()});
      text = result.value;
    } else {
      text = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer());
    }
    return {text: validateText(text, 'Tệp không có nội dung văn bản để tóm tắt.'), note: ''};
  } catch (error) {
    if (error instanceof ImportError) throw error;
    if (error.name === 'PasswordException') throw new ImportError('PDF được bảo vệ bằng mật khẩu. Hãy lưu bản PDF không đặt mật khẩu rồi tải lại.');
    throw new ImportError(extension === 'txt' ? 'Không đọc được TXT. Hãy lưu tệp bằng mã hóa UTF-8 rồi thử lại.'
      : `Không đọc được tệp ${extension === 'pdf' ? 'PDF' : 'Word'}. Tệp có thể bị hỏng, được mã hóa hoặc không đúng định dạng.`);
  }
}
