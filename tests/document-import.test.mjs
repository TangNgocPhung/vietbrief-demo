import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocument, pdfPageText } from '../dist/document-import.js';

const file = (text, name) => new File([text], name);
test('TXT preserves Vietnamese and normalizes NFC and line endings', async () => {
  const result = await readDocument(file('\uFEFFHà Nội\r\nĐọc báo tiếng Việt.\rDòng mới.', 'news.TXT'));
  assert.equal(result.text, 'Hà Nội\nĐọc báo tiếng Việt.\nDòng mới.');
});
test('rejects invalid, empty, non-UTF8 and oversized documents before parsing', async () => {
  await assert.rejects(readDocument(file('abc', 'old.doc')), /lưu thành .docx/);
  await assert.rejects(readDocument(file('abc', 'image.png')), /TXT.*PDF.*Word/);
  await assert.rejects(readDocument(file(' \n ', 'empty.txt')), /không có nội dung/);
  await assert.rejects(readDocument(file('a'.repeat(200001), 'large.txt')), /200.000/);
  await assert.rejects(readDocument(new File([new Uint8Array([0xff])], 'invalid.txt')), /UTF-8/);
  await assert.rejects(readDocument({name: 'large.pdf', size: 20 * 1024 * 1024 + 1}), /20 MB/);
});
test('PDF text joins adjacent fragments, words and lines in reading order', () => {
  const item = (str, x, y, width, hasEOL = false) => ({str, transform: [12, 0, 0, 12, x, y], width, hasEOL});
  assert.equal(pdfPageText([
    item('Thành', 0, 100, 30), item(' phố', 30, 100, 20),
    item('Hà', 54, 100, 12), item(' Nội', 66, 100, 20, true),
    item('Tin', 0, 80, 15), item(' tức.', 15, 80, 20),
  ]), 'Thành phố Hà Nội\nTin tức.');
});
