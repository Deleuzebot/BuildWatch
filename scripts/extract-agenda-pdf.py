"""Bounded, read-only PDF text extraction. No OCR, network, or AI."""
import io, json, resource, sys
if sys.platform != "linux":
    raise RuntimeError("Bounded PDF extraction requires the Linux maintenance worker")
resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
# Separate worker process: malformed PDFs cannot exhaust the Node worker's heap.
resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
from pypdf import PdfReader
data = sys.stdin.buffer.read(2_000_001)
if len(data) > 2_000_000 or not data.startswith(b"%PDF-"):
    raise ValueError("PDF input is missing or exceeds the document ceiling")
reader = PdfReader(io.BytesIO(data), strict=True)
if reader.is_encrypted:
    raise ValueError("Encrypted PDF requires manual review")
pages = []
remaining = 120_000
for index, page in enumerate(reader.pages):
    if index >= 50 or remaining <= 0:
        break
    text = (page.extract_text() or "")[:remaining]
    pages.append({"page": index + 1, "text": text})
    remaining -= len(text)
print(json.dumps({"pages": pages, "totalPages": len(reader.pages), "truncated": len(pages) < len(reader.pages) or remaining <= 0}))
