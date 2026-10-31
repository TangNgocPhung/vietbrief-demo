import { extractiveSummary, rouge, wordCount, newNumberStrings, MAX_CHARS } from './engine.js';
import { samples } from './samples.js';

const $ = id => document.getElementById(id);
const isGitHubPages = location.hostname.endsWith('.github.io');
const names = { extractive: 'Trích xuất câu', mt5: 'mT5-small', vit5: 'ViT5-base' };
const emptyMarkup = $('results').innerHTML;
const state = {
  selected: 'extractive', backend: null, checkedOnce: false, busy: false,
  sample: null, inputTitle: 'Bài nhập của bạn', inputNote: '', run: null,
  history: [], filter: 'all', controller: null, manuallyCancelled: false,
};
const clone = value => JSON.parse(JSON.stringify(value));
const number = value => Number(value).toLocaleString('vi-VN');
const seconds = value => value < .01 ? '< 0,01 s' : `${value.toLocaleString('vi-VN', {maximumFractionDigits: 2})} s`;
const searchText = value => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function setError(message = '') {
  $('error').textContent = message;
  $('error').hidden = !message;
}
function showView(view) {
  if (state.busy) return;
  document.querySelectorAll('.app-view').forEach(section => { section.hidden = section.id !== `${view}-view`; });
  document.querySelectorAll('.nav-button').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  window.scrollTo({top: 0, behavior: 'smooth'});
}
function canUse(key) { return key === 'extractive' || !!state.backend?.models?.[key]?.available; }
function syncMethod() {
  document.querySelectorAll('[data-model]').forEach(button => {
    const key = button.dataset.model;
    button.classList.toggle('selected', key === state.selected);
    button.setAttribute('aria-pressed', String(key === state.selected));
    button.disabled = state.busy || !canUse(key);
    button.title = canUse(key) ? '' : state.backend?.models?.[key]?.reason || 'Dùng mô hình trong bản Python trên máy có checkpoint.';
  });
  $('compare').disabled = state.busy || !(canUse('mt5') && canUse('vit5'));
  $('compare').title = $('compare').disabled ? 'Cần cả hai checkpoint trong bản Python.' : '';
  $('extract-settings').hidden = state.selected !== 'extractive' || $('compare').checked;
  if ($('compare').checked) {
    $('method-notice').textContent = 'Chạy mT5 rồi ViT5 trên cùng bài báo. Mỗi lần chỉ giữ một mô hình trong bộ nhớ; từng kết quả sẽ hiện ngay khi hoàn tất.';
  } else if (state.selected === 'extractive') {
    $('method-notice').textContent = isGitHubPages
      ? 'GitHub Pages chọn câu có sẵn ngay trong trình duyệt. mT5/ViT5 chạy trong bản Python trên máy có checkpoint.'
      : 'Chọn câu có sẵn trong bài theo tần suất âm tiết; đây không phải đầu ra của mT5/ViT5.';
  } else {
    $('method-notice').textContent = 'Dùng checkpoint fine-tune đã đánh giá. Đọc tối đa 512 token, sinh tối đa 128 token mới; đầu vào dài hơn sẽ có cảnh báo.';
  }
}
async function checkBackend() {
  if (state.busy) return;
  $('refresh-connection').disabled = true;
  if (!isGitHubPages) {
    try {
      const response = await fetch('/api/status', {signal: AbortSignal.timeout(5000), cache: 'no-store'});
      const data = response.ok ? await response.json() : null;
      state.backend = data?.service === 'vietbrief' ? data : null;
    } catch { state.backend = null; }
  }
  const ready = ['mt5', 'vit5'].filter(canUse);
  $('connection-status').textContent = isGitHubPages ? 'GitHub Pages · Trình duyệt'
    : ready.length ? `${ready.length} mô hình sẵn sàng · ${state.backend.device}`
    : state.backend ? 'Python đã kết nối · Chờ checkpoint' : 'Chế độ trình duyệt';
  if (!state.checkedOnce && ready.length) state.selected = ready.includes('mt5') ? 'mt5' : ready[0];
  if (!canUse(state.selected)) state.selected = 'extractive';
  if (!canUse('mt5') || !canUse('vit5')) $('compare').checked = false;
  state.checkedOnce = true;
  document.querySelectorAll('[data-model-status]').forEach(cell => {
    cell.textContent = canUse(cell.dataset.modelStatus) ? 'Đã kết nối · run04' : isGitHubPages ? 'Dùng trong bản Python' : 'Chưa sẵn sàng';
  });
  $('refresh-connection').disabled = false;
  syncMethod();
}
function setFocusResults(active) {
  $('workspace').classList.toggle('results-focus', active);
  $('focus-results').setAttribute('aria-pressed', String(active));
  $('focus-results').textContent = active ? 'Hiện bài gốc ↙' : 'Mở rộng kết quả ↗';
}
function updateFields() {
  $('input-count').textContent = `${number(wordCount($('article').value))} âm tiết · ${number($('article').value.length)} ký tự`;
  $('reference-badge').textContent = $('reference').value.trim() ? 'Đã có tham chiếu' : 'Chưa có';
  const run = state.run;
  const hasResults = !!run?.results.length;
  $('stale-notice').hidden = !hasResults || ($('article').value === run.source && $('reference').value === run.reference);
  $('rescore').disabled = state.busy || !hasResults || $('article').value !== run.source;
  $('focus-results').disabled = state.busy || !hasResults;
}
function renderProvenance() {
  const area = $('sample-provenance');
  area.replaceChildren();
  area.hidden = !state.sample && !state.inputNote;
  if (state.sample) {
    area.append(node('strong', '', state.sample.title));
    area.append(node('span', '', state.sample.kind === 'xlsum'
      ? `XL-Sum / Test · ID ${state.sample.sourceId} · Tin lưu trữ`
      : 'Bài và tham chiếu minh họa tự soạn'));
    if (state.sample.sourceUrl) {
      const link = node('a', '', 'BBC Tiếng Việt qua XL-Sum · CC BY-NC-SA 4.0 ↗');
      link.href = state.sample.sourceUrl; link.target = '_blank'; link.rel = 'noreferrer'; area.append(link);
    }
  } else area.append(node('span', '', state.inputNote));
}
function loadSample(key) {
  if (state.busy) return;
  const sample = samples.find(item => item.key === key);
  if (!sample) return;
  state.sample = sample; state.inputTitle = sample.title; state.inputNote = '';
  $('article').value = sample.text; $('reference').value = sample.reference;
  renderProvenance(); updateFields(); setError(); setFocusResults(false); showView('demo');
  $('reference-details').open = false;
}
function renderLibrary() {
  const query = searchText($('sample-search').value.trim());
  const filtered = samples.filter(sample => (state.filter === 'all' || sample.kind === state.filter)
    && searchText(`${sample.title} ${sample.topic} ${sample.description}`).includes(query));
  $('sample-library').replaceChildren();
  filtered.forEach(sample => {
    const card = node('article', 'sample-card');
    const header = node('div', 'sample-card-top');
    header.append(node('span', sample.kind === 'xlsum' ? 'sample-kind' : 'sample-kind illustration', sample.kind === 'xlsum' ? 'XL-SUM / TEST' : 'TỰ SOẠN'));
    header.append(node('span', 'sample-topic', sample.topic));
    card.append(header, node('h2', '', sample.title), node('p', 'sample-description', sample.description));
    const meta = node('div', 'sample-meta');
    meta.append(node('span', '', `${number(wordCount(sample.text))} âm tiết`), node('span', '', 'Có tham chiếu'), node('span', '', sample.archived ? 'Tin lưu trữ' : 'Minh họa'));
    const preview = node('details', 'sample-preview');
    preview.append(node('summary', '', 'Đọc trước bài báo'), node('p', '', sample.text));
    const use = node('button', 'sample-use', 'Đưa vào demo ↗');
    use.addEventListener('click', () => loadSample(sample.key));
    card.append(meta, preview, use); $('sample-library').append(card);
  });
  $('library-empty').hidden = filtered.length !== 0;
}
function metric(label, value) {
  const item = node('div', 'metric');
  item.append(node('strong', '', value), document.createTextNode(label)); return item;
}
function scoreRun(run) {
  run.results.forEach(result => {
    delete result.rouge; delete result.score_error;
    if (run.reference.trim()) {
      try { result.rouge = rouge(result.summary, run.reference); }
      catch (error) { result.score_error = error.message; }
    }
    result.new_number_strings = newNumberStrings(result.summary, run.source);
  });
}
function renderRun() {
  const run = state.run;
  $('results').replaceChildren();
  $('results').dataset.count = String(run?.results.length || 0);
  if (!run?.results.length) { $('results').innerHTML = emptyMarkup; }
  for (const result of run?.results || []) {
    const card = node('article', 'result-card');
    const title = node('div', 'result-model', result.label);
    title.append(node('span', '', result.model === 'extractive' ? 'TRÍCH XUẤT' : `FINE-TUNE · ${(result.device || '').toUpperCase()}`));
    card.append(title, node('p', 'summary-text', result.summary || '(Mô hình sinh kết quả rỗng.)'));
    const metrics = node('div', 'result-metrics');
    if (result.input_tokens != null) {
      metrics.append(metric('token đầu vào', number(result.input_tokens)), metric('token được đọc', number(result.used_tokens)));
    } else metrics.append(metric('câu được chọn', `${result.sentences_selected} / ${result.sentences_total}`));
    metrics.append(metric('thời gian xử lý', seconds(result.seconds)), metric('độ dài / bài gốc', `${(wordCount(result.summary) / Math.max(wordCount(run.source), 1) * 100).toFixed(1)}%`));
    card.append(metrics);
    if (result.rouge) {
      const scores = node('div', 'result-metrics score-metrics');
      for (const [key, value] of Object.entries(result.rouge)) scores.append(metric(key.replace('rouge', 'ROUGE-'), value.toFixed(2)));
      card.append(scores);
    }
    for (const warning of [...(result.warnings || []), ...(result.score_error ? [result.score_error] : [])]) card.append(node('p', 'notice', warning));
    if (result.new_number_strings.length) card.append(node('p', 'notice fact-notice', `Cần đối chiếu chuỗi chữ số: ${result.new_number_strings.join(', ')}. Chúng không xuất hiện trong bài gốc; đây chỉ là cờ rà soát, không phải kết luận thông tin sai.`));
    if (result.selected_sentences?.length) {
      const details = node('details', 'selected-sentences');
      details.append(node('summary', '', 'Xem các câu được chọn trong bài gốc'));
      const list = node('ol');
      result.selected_sentences.forEach(sentence => {
        const item = node('li'); item.append(node('small', '', `Câu ${sentence.index}`), node('p', '', sentence.text)); list.append(item);
      });
      details.append(list); card.append(details);
    }
    $('results').append(card);
  }
  if (run?.results.length && run.reference.trim()) {
    const reference = node('details', 'reference-preview');
    reference.append(node('summary', '', 'Đối chiếu với bản tóm tắt tham chiếu'), node('blockquote', '', run.reference));
    $('results').append(reference);
  }
  $('result-actions').hidden = !run?.results.length;
  renderComparison(); updateFields();
}
function renderComparison() {
  const results = state.run?.results || [];
  $('comparison-section').hidden = results.length < 2;
  $('comparison-body').replaceChildren();
  if (results.length < 2) return;
  results.forEach(result => {
    const row = node('tr');
    const values = [result.label, result.input_tokens == null ? '—' : number(result.input_tokens), result.used_tokens == null ? '—' : number(result.used_tokens), seconds(result.seconds), ...['rouge1', 'rouge2', 'rougeL'].map(key => result.rouge ? result.rouge[key].toFixed(2) : '—')];
    values.forEach(value => row.append(node('td', '', value))); $('comparison-body').append(row);
  });
}
function rememberRun() {
  if (!state.run?.results.length) return;
  state.history = [clone(state.run), ...state.history.filter(item => item.id !== state.run.id)].slice(0, 5);
  renderHistory();
}
function renderHistory() {
  $('history-count').textContent = `${state.history.length} lần chạy`;
  $('clear-history').disabled = state.busy || !state.history.length;
  $('history-list').replaceChildren();
  if (!state.history.length) $('history-list').append(node('p', '', 'Chưa có kết quả trong phiên này.'));
  state.history.forEach(run => {
    const button = node('button', 'history-entry');
    button.append(node('strong', '', run.title), node('span', '', `${run.results.map(result => result.label).join(' + ')} · ${new Date(run.createdAt).toLocaleTimeString('vi-VN')} · ${run.status === 'partial' ? 'Kết quả một phần' : 'Hoàn tất'}`));
    button.addEventListener('click', () => {
      if (state.busy) return;
      state.run = clone(run); state.sample = samples.find(sample => sample.key === run.sampleKey) || null;
      state.inputTitle = run.title; state.inputNote = '';
      $('article').value = run.source; $('reference').value = run.reference;
      $('sentence-limit').value = String(run.maxSentences);
      state.selected = canUse(run.models[0]) ? run.models[0] : 'extractive';
      $('compare').checked = run.models.length > 1 && canUse('mt5') && canUse('vit5');
      renderProvenance(); syncMethod(); renderRun(); setError(); setFocusResults(false); showView('demo');
    });
    $('history-list').append(button);
  });
}
function setBusy(active) {
  state.busy = active;
  if (active) {
    document.querySelectorAll('button,input,textarea,select').forEach(element => {
      if (element.id === 'cancel-run') return;
      element.dataset.wasDisabled = String(element.disabled); element.disabled = true;
    });
  } else {
    document.querySelectorAll('[data-was-disabled]').forEach(element => {
      element.disabled = element.dataset.wasDisabled === 'true'; delete element.dataset.wasDisabled;
    });
  }
  $('output-panel').setAttribute('aria-busy', String(active));
  $('run-progress').hidden = !active;
  if (!active) { syncMethod(); updateFields(); renderHistory(); }
}
async function run() {
  if (state.busy) return;
  setError();
  const text = $('article').value;
  if (!text.trim()) { setError('Hãy nhập bài báo hoặc chọn một bài trong thư viện.'); $('article').focus(); return; }
  if (text.length > MAX_CHARS) { setError('Bài báo vượt 200.000 ký tự. Hãy rút ngắn nội dung.'); return; }
  const models = $('compare').checked ? ['mt5', 'vit5'] : [state.selected];
  if (models.some(key => !canUse(key))) { setError('Mô hình chưa sẵn sàng. Kiểm tra lại kết nối hoặc chọn trích xuất câu.'); return; }
  state.run = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), source: text, reference: $('reference').value, sampleKey: state.sample?.key || null, title: state.inputTitle, models, maxSentences: Number($('sentence-limit').value), results: [], status: 'running' };
  state.controller = new AbortController(); state.manuallyCancelled = false;
  const current = state.run;
  let timedOut = false;
  const start = performance.now();
  const timer = setInterval(() => { $('progress-time').textContent = `Đã chờ ${Math.floor((performance.now() - start) / 1000)} giây · Lần đầu cần nạp trọng số`; }, 1000);
  const timeout = setTimeout(() => { timedOut = true; state.controller?.abort(); }, 600000);
  setBusy(true); renderRun();
  $('progress-time').textContent = 'Thời gian chờ được đo trực tiếp, không phải phần trăm hoàn thành.';
  try {
    for (const [index, key] of models.entries()) {
      if (state.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      $('progress-label').textContent = `${models.length > 1 ? `${index + 1}/${models.length} · ` : ''}Đang chạy ${names[key]}`;
      let result;
      if (key === 'extractive') {
        await new Promise(resolve => setTimeout(resolve, 120));
        if (state.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const began = performance.now();
        result = extractiveSummary(text, {maxSentences: current.maxSentences});
        result.seconds = (performance.now() - began) / 1000;
      } else {
        const response = await fetch('/api/summarize', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, model: key}), signal: state.controller.signal });
        let data;
        try { data = await response.json(); } catch { throw new Error('Máy chủ không trả về dữ liệu hợp lệ. Hãy kiểm tra cửa sổ Python.'); }
        if (!response.ok) throw new Error(data.error || 'Không thể tạo bản tóm tắt.');
        result = data;
      }
      current.results.push(result); scoreRun(current); renderRun();
      if (result.device) $('connection-status').textContent = `Python đã kết nối · ${result.device.toUpperCase()}`;
    }
    current.status = 'complete';
  } catch (error) {
    current.status = current.results.length ? 'partial' : 'failed';
    const message = state.manuallyCancelled ? 'Đã dừng chờ trên trình duyệt. Máy chủ có thể vẫn đang xử lý; hãy chờ trước khi gửi lại.'
      : timedOut ? 'Đã hết thời gian chờ. Máy chủ có thể vẫn đang xử lý.' : error.message;
    setError(`${message}${current.results.length ? ' Kết quả đã hoàn thành được giữ lại bên trên.' : ''}`);
  } finally {
    clearInterval(timer); clearTimeout(timeout); state.controller = null;
    setBusy(false); rememberRun(); renderRun();
  }
}
function resultText() {
  return (state.run?.results || []).map(result => `${result.label}\n${result.summary}\n\nThời gian xử lý: ${seconds(result.seconds)}${result.input_tokens != null ? `\nToken đầu vào: ${result.input_tokens} | Token được đọc: ${result.used_tokens}` : ''}${result.rouge ? '\n' + Object.entries(result.rouge).map(([key, value]) => `${key}: ${value.toFixed(2)}`).join(' | ') : ''}\n${(result.warnings || []).join('\n')}${result.new_number_strings?.length ? `\nChuỗi chữ số cần đối chiếu: ${result.new_number_strings.join(', ')}` : ''}`).join('\n\n--------------------\n\n');
}
function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = node('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('.brand,.footer-brand').forEach(link => link.addEventListener('click', event => { event.preventDefault(); showView('demo'); }));
document.querySelectorAll('[data-model]').forEach(button => button.addEventListener('click', () => {
  state.selected = button.dataset.model; $('compare').checked = false; syncMethod(); setError();
}));
document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => loadSample(button.dataset.sample)));
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  renderLibrary();
}));
$('sample-search').addEventListener('input', renderLibrary);
$('refresh-connection').addEventListener('click', checkBackend);
$('compare').addEventListener('change', () => { if ($('compare').checked) state.selected = 'mt5'; syncMethod(); });
$('article').addEventListener('input', () => {
  if (state.sample && $('article').value !== state.sample.text) {
    state.sample = null; state.inputTitle = 'Bài đã chỉnh sửa';
    state.inputNote = 'Bài mẫu đã thay đổi; tham chiếu đi kèm đã được gỡ để tránh đối chiếu nhầm.';
    $('reference').value = ''; renderProvenance();
  }
  updateFields();
});
$('reference').addEventListener('input', updateFields);
$('rescore').addEventListener('click', () => {
  if (!state.run?.results.length || $('article').value !== state.run.source || state.busy) return;
  state.run.reference = $('reference').value; scoreRun(state.run); renderRun(); rememberRun(); setError();
});
$('summarize').addEventListener('click', run);
$('cancel-run').addEventListener('click', () => { if (state.controller) { state.manuallyCancelled = true; state.controller.abort(); } });
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !$('demo-view').hidden) { event.preventDefault(); run(); } });
$('focus-results').addEventListener('click', () => setFocusResults(!$('workspace').classList.contains('results-focus')));
$('clear').addEventListener('click', () => {
  $('article').value = ''; $('reference').value = ''; $('file').value = '';
  state.sample = null; state.inputNote = ''; state.inputTitle = 'Bài nhập của bạn'; state.run = null;
  renderProvenance(); renderRun(); setError(); setFocusResults(false); $('article').focus();
});
$('clear-history').addEventListener('click', () => { state.history = []; renderHistory(); });
$('upload').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async () => {
  const file = $('file').files[0]; if (!file) return;
  try {
    if (!/\.txt$/i.test(file.name)) throw new Error('Hãy chọn tệp .txt mã hóa UTF-8.');
    if (file.size > 800000) throw new Error('Tệp quá lớn; chỉ hỗ trợ tối đa 200.000 ký tự.');
    const text = await file.text();
    if (text.length > MAX_CHARS) throw new Error('Tệp vượt 200.000 ký tự.');
    $('article').value = text; $('reference').value = '';
    state.sample = null; state.inputNote = `Tệp đã nạp: ${file.name}`; state.inputTitle = file.name;
    renderProvenance(); updateFields(); setError(); setFocusResults(false);
  } catch (error) { setError(error.message); }
  finally { $('file').value = ''; }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(resultText()); $('copy-status').textContent = 'Đã sao chép'; setTimeout(() => { $('copy-status').textContent = ''; }, 2500); }
  catch { setError('Trình duyệt không cho phép sao chép. Hãy dùng nút tải kết quả.'); }
});
$('download').addEventListener('click', () => {
  if (!state.run?.results.length) return;
  if ($('export-format').value === 'json') {
    download(JSON.stringify({application: 'VietBrief', version: '2.0', ...state.run}, null, 2), 'application/json;charset=utf-8', 'vietbrief-ket-qua.json');
  } else {
    download(`\uFEFFVIETBRIEF · KẾT QUẢ DEMO\n${new Date(state.run.createdAt).toLocaleString('vi-VN')}\n${state.run.title}\n\n${resultText()}\n\nBÀI BÁO GỐC\n${state.run.source}${state.run.reference ? `\n\nTHAM CHIẾU\n${state.run.reference}` : ''}`, 'text/plain;charset=utf-8', 'vietbrief-ket-qua.txt');
  }
});
renderLibrary(); updateFields(); checkBackend();
