import test from 'node:test';
import assert from 'node:assert/strict';
import { extractiveSummary, rouge, cleanText, newNumberStrings } from '../dist/engine.js';
test('rejects blank and oversized input',()=>{assert.throws(()=>extractiveSummary('  '));assert.throws(()=>extractiveSummary('a'.repeat(200001)));assert.throws(()=>extractiveSummary('...'));});
test('extracts whole source sentences in original order',()=>{const text='Nhà trường mở thư viện số. Thư viện số hỗ trợ tra cứu tài liệu. Sinh viên dùng tài khoản trường. Tài liệu được kiểm tra bản quyền. Người học gửi phản hồi.';const r=extractiveSummary(text);assert.equal(r.model,'extractive');assert.equal(r.input_tokens,null);assert.ok(r.sentences_selected<=3);const sentences=r.summary.match(/[^.]+\./g);let position=-1;for(const sentence of sentences){const next=text.indexOf(sentence.trim());assert.ok(next>position);position=next;}});
test('ROUGE handles Vietnamese NFC and repeated ngrams correctly',()=>{assert.deepEqual(rouge('Hà Nội rất đẹp.','Hà Nội rất đẹp'),{rouge1:100,rouge2:100,rougeL:100});assert.deepEqual(rouge('a a a','a a'),{rouge1:80,rouge2:200/3,rougeL:80});assert.deepEqual(rouge('mèo','chó'),{rouge1:0,rouge2:0,rougeL:0});});
test('strips hidden characters and bounds pathological sentence count',()=>{assert.equal(cleanText('a\u200b b\n c'),'a b c');const r=extractiveSummary('Câu có thông tin. '.repeat(600));assert.equal(r.truncated,true);});
test('sentence limit and provenance preserve source order',()=>{
 const source='Thư viện mở cửa mỗi ngày. Sinh viên đọc sách tại phòng học. Giáo viên hướng dẫn tìm tài liệu. Máy tính hỗ trợ tra cứu. Nhà trường tiếp nhận phản hồi. Sách mới được bổ sung. Bạn đọc đăng ký tài khoản. Các lớp học tham gia chương trình.';
 const result=extractiveSummary(source,{maxSentences:1});
 assert.equal(result.sentences_selected,1);
 assert.equal(result.summary,result.selected_sentences[0].text);
 assert.ok(source.includes(result.summary));
 assert.ok(result.selected_sentences[0].index>=1);
 assert.throws(()=>extractiveSummary(source,{maxSentences:0}));
 assert.throws(()=>extractiveSummary(source,{maxSentences:6}));
});
test('numeric review flags only new complete digit strings and de-duplicates',()=>{
 assert.deepEqual(newNumberStrings('Có 13 người, tăng lên 13 rồi 25.','Có 2013 người và 25 học sinh.'),['13']);
 assert.deepEqual(newNumberStrings('Năm 2026 có 30 mẫu.','Năm 2026 có 30 mẫu.'),[]);
 assert.deepEqual(newNumberStrings('Không có số.','Bài gốc.'),[]);
});
