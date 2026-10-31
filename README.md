# VietBrief — Demo tóm tắt tin tức tiếng Việt

Web demo dựa trên notebook `NLP_Nhóm_3_Cuối_kỳ (8).ipynb` và PDF `NHÓM 5 · MÔN XỬ LÝ NGÔN NGỮ TỰ NHIÊN.pdf`.

## Lấy mã nguồn từ GitHub

```powershell
git clone https://github.com/TangNgocPhung/vietbrief-demo.git
cd vietbrief-demo
python server.py
```

Mở **http://127.0.0.1:8765** để thử chế độ trích xuất câu. Kho mã nguồn không chứa checkpoint, môi trường `.venv`, `models.json` hoặc dữ liệu Test. Để chạy mT5/ViT5 sau khi clone, làm theo mục **Nối mô hình thật**; có thể sao chép thư mục `models/` từ bản demo đã cấu hình trên máy này và tạo `models.json` với đường dẫn tương ứng. Chỉ thành viên được cấp quyền mới truy cập được kho riêng tư.

## Trạng thái trên máy này

Đã ghép đủ hai checkpoint **mT5-small và ViT5-base, run04** từ các ZIP `003`–`006` vào `models/NLP_CuoiKy/pretrained/`. `models.json` đã trỏ đến hai thư mục `best/` tương ứng. Môi trường `.venv` đã được cài Transformers 4.46.3 và dùng PyTorch CPU có sẵn trên máy; nhấp đúp `start-demo.bat` sẽ tự dùng môi trường này. Không cần giải nén thêm hay sửa đường dẫn trên máy hiện tại.

Giữ nguyên thư mục `models/`, `.venv` và `models.json` khi chạy. Bản ZIP mã nguồn không đóng kèm khoảng 2,1 GB trọng số hoặc môi trường Python. Muốn chuyển sang máy khác, cần chép thêm `models/` và cài lại môi trường theo hướng dẫn phía dưới. Toàn bộ suy luận chạy tại máy, không triển khai trực tuyến.

## Chạy ngay trên Windows

Nhấp đúp `start-demo.bat`, sau đó mở **http://127.0.0.1:8765**. Hoặc mở terminal tại thư mục này:

```powershell
python server.py
```

Cần Python 3.10 trở lên. Chế độ **Trích xuất câu** không cần cài thêm thư viện, chạy ngay trên trình duyệt. Chế độ này chọn tối đa ba câu từ bài gốc, dùng tần suất âm tiết và hạn chế câu trùng ý; **không phải mT5/ViT5**. Số âm tiết được đếm theo khoảng trắng, không phải số token tokenizer. Nút tải TXT nhận văn bản UTF-8.

## Nối mô hình thật

1. Tải output đã lưu của notebook Kaggle. Giữ thư mục `best/` và `test_info.json` cạnh nó cho mỗi mô hình:

```text
NLP_CuoiKy/
  pretrained/
    mt5/kaggle_run01/
      best/                 # config.json, trọng số, tokenizer
      test_info.json
    vit5/kaggle_run01/
      best/
      test_info.json
```

`best/` phải chứa `config.json`, `model.safetensors` hoặc `pytorch_model.bin` (hỗ trợ index của trọng số chia shard), và tokenizer do notebook xuất. **Không dùng `last.pt`**, vì đó là checkpoint tiếp tục huấn luyện chứa optimizer. Không lấy model gốc `google/mt5-small` hay `VietAI/vit5-base` thay cho trọng số đã fine-tune.

2. Cài thư viện vào môi trường Python đang chạy web:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-models.txt
```

Nếu đã có môi trường PyTorch/CUDA dùng cho notebook, có thể dùng môi trường đó và chỉ bổ sung thư viện còn thiếu. Giữ bản torch phù hợp CUDA của máy. Mã dùng Transformers 4.46.3 theo notebook; không yêu cầu GPU để mở giao diện. Suy luận CPU có thể chậm.

3. Sao chép `models.example.json` thành `models.json` rồi thay đường dẫn bằng vị trí checkpoint thật. Dùng dấu `/` trong đường dẫn Windows để tránh lỗi escape JSON. Có thể chỉ cấu hình một mô hình.

```json
{
  "mt5": "D:/NLP_CuoiKy/pretrained/mt5/kaggle_run01/best",
  "vit5": "D:/NLP_CuoiKy/pretrained/vit5/kaggle_run01/best"
}
```

Hoặc đặt biến môi trường `NLP_MODEL_ROOT` tới thư mục chứa `pretrained/`, hay dùng `MT5_CHECKPOINT` / `VIT5_CHECKPOINT`. Mặc định run là `kaggle_run01`; có thể cấu hình `root` và `run` trong JSON. Thư mục `best/` được kiểm tra cùng `test_info.json` theo điều kiện của demo notebook; trạng thái sẵn sàng chỉ xác nhận file/thư viện, lỗi trọng số được báo lúc nạp.

4. Chạy máy chủ bằng đúng Python đã cài thư viện, rồi tải lại trang:

```powershell
.\.venv\Scripts\python.exe server.py
```

Khi checkpoint sẵn sàng, web tự chọn mT5 nếu có; nếu chỉ có ViT5 thì chọn ViT5. Cả hai sẵn sàng sẽ mở lựa chọn **So sánh mT5 & ViT5**. Mỗi lần chỉ giữ một mô hình trong bộ nhớ. Máy chủ mặc định chỉ lắng nghe trên máy cá nhân (127.0.0.1).

## Chức năng

- Dán bài báo hoặc tải TXT, ba bài minh họa tự soạn, đếm âm tiết/ký tự.
- Giới hạn 200.000 ký tự; chuẩn hóa NFC; thông báo đầu vào rỗng và lỗi checkpoint.
- Nạp mô hình và tokenizer từ checkpoint cục bộ, `local_files_only=True`; không tự tải model, không huấn luyện lại.
- Sinh theo notebook: input 512, `num_beams=4`, `length_penalty=1.0`, `no_repeat_ngram_size=3`, `max_new_tokens=128`; không thêm tiền tố tác vụ.
- CPU/T4 dùng FP32, GPU hỗ trợ dùng BF16; không ép FP16.
- Hiển thị token thật từ tokenizer, token được đọc và thời gian sinh; cảnh báo cắt bài, OOM và đầu ra rỗng.
- So sánh hai mô hình lần lượt trên cùng đầu vào; lần đổi model sẽ nạp lại trọng số.
- ROUGE-1/2/L F1 theo âm tiết Unicode NFC, chữ thường, thang 0–100 nếu có tham chiếu. Bộ tách của web tương đương `\w+` của notebook cho tiếng Việt; giới hạn 1.000 âm tiết mỗi tóm tắt để bảo vệ trình duyệt. Không có tham chiếu thì không tạo điểm. BLEU và BERTScore không được tính trong giao diện.
- Sao chép, tải kết quả kèm bài gốc, thời gian và cảnh báo. Nội dung kết quả được hiển thị dưới dạng văn bản, không chạy HTML từ đầu vào.

## Đối chiếu hai nguồn

- Chức năng demo bám ô 58 của notebook và trang 46–48 PDF: mT5/ViT5; scratch chưa nối vào web.
- Giới hạn/sinh bám ô 47–49 notebook và trang 26 PDF.
- Thống kê dữ liệu: notebook ô 9 / PDF trang 30.
- Bảng checkpoint ở trang giới thiệu: PDF trang 35, là Validation; không lấy làm điểm của đầu vào mới.
- PDF trang 25 ghi siêu tham số huấn luyện khác notebook/các trang kết quả sau. Demo không huấn luyện, không suy diễn các giá trị đó thành cấu hình mới; dùng cấu hình sinh nhất quán nói trên.
- Notebook ghi Nhóm 3, PDF ghi Nhóm 5; trang giới thiệu lấy tên Nhóm 5 theo PDF, có ghi rõ khác biệt nguồn.

## Bản web được lưu trữ

Thư mục `dist/` có thể lưu trữ tĩnh. Bản này hỗ trợ trích xuất câu, TXT, ROUGE, sao chép và tải kết quả ngay trên trình duyệt. Máy chủ PyTorch cần chạy tại máy có checkpoint; hosting tĩnh không chạy checkpoint GPU. Do đó mT5/ViT5 chỉ chạy khi mở web từ máy chủ Python ở trên. Bài báo không được gửi đi trong chế độ trích xuất; font Google có thể được tải qua mạng, có font dự phòng nếu ngoại tuyến.

## Kiểm tra

```powershell
node --test tests/engine.test.mjs
python -m unittest discover -s tests -p "test_*.py" -v
```

Các kiểm tra bao gồm trích xuất câu, ROUGE tiếng Việt, giới hạn đầu vào, checkpoint thiếu đánh giá và khóa suy luận đồng thời. Chạy mô hình thật cần checkpoint, không có trọng số hay kết quả neural giả được kèm trong dự án.

Đã kiểm tra HTTP trang/API (200), đầu vào rỗng (400), thiếu checkpoint (503); chạy bài mẫu và ROUGE trong trình duyệt, thông báo checkpoint chưa có, sao chép và chuyển trang giới thiệu. Giao diện đã xem trên desktop và màn hình rộng 390 px, không có tràn ngang ở màn hình nhỏ.

Ngày 31/10/2026 đã chạy hai checkpoint `run04` thật trên CPU với mẫu đầu của `processed/test.csv` (ID `060116_indonesia_birdflu`). Đầu ra của **cả hai mô hình trùng hoàn toàn** cột `prediction` trong `predictions_mt5.csv` / `predictions_vit5.csv` của cùng run. ViT5: 344 token, sinh khoảng 9,34 giây; mT5: 659 token, đọc 512 token có cảnh báo, sinh khoảng 9,56 giây. Thời gian này không gồm nạp checkpoint và chỉ phản ánh một mẫu, không phải tốc độ trung bình toàn bộ Test. Chi tiết được lưu tại `validation/sample.json` và `validation/inference_results.json` trên máy này. Kết quả khớp checkpoint không có nghĩa mọi dữ kiện sinh ra đều chính xác; cần đối chiếu bài gốc.

Đã kiểm tra thêm luồng **So sánh mT5 & ViT5** trực tiếp trên giao diện với bài mẫu Giáo dục: hai yêu cầu trả về thành công, hiển thị hai kết quả riêng cùng token, CPU, thời gian sinh và ROUGE. Thời gian sinh quan sát được là 13,64 giây (mT5) và 9,52 giây (ViT5), chưa gồm nạp trọng số. Trang giới thiệu hiển thị cả hai checkpoint đã kết nối. 8 kiểm tra tự động JavaScript/Python đều đạt.
