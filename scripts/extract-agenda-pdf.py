"""Bounded, read-only PDF text extraction. No OCR, network, or AI."""
import io, json, resource, sys, time
if sys.platform != "linux":
    raise RuntimeError("Bounded PDF extraction requires the Linux maintenance worker")
profile = sys.argv[1] if len(sys.argv) > 1 else "standard"
if profile not in ("standard", "planning50"):
    raise ValueError("Unknown PDF resource profile")
large = profile == "planning50"
max_bytes, max_pages, max_text = (50_000_000, 200, 1_000_000) if large else (2_000_000, 50, 120_000)
cpu, memory, max_expanded = (45, 1024 * 1024 * 1024, 64_000_000) if large else (10, 512 * 1024 * 1024, 32_000_000)
resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
# Separate worker process: malformed PDFs cannot exhaust the Node worker's heap.
resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
started = time.monotonic()
from pypdf import PdfReader
data = sys.stdin.buffer.read(max_bytes + 1)
if len(data) > max_bytes or not data.startswith(b"%PDF-"):
    raise ValueError("PDF input is missing or exceeds the document ceiling")
reader = PdfReader(io.BytesIO(data), strict=True)
if reader.is_encrypted:
    raise ValueError("Encrypted PDF requires manual review")
pages = []
remaining = max_text
expanded = 0
for index, page in enumerate(reader.pages):
    if index >= max_pages or remaining <= 0:
        break
    contents = page.get_contents()
    if contents is not None:
        # Decompression is also protected by the process memory and CPU caps.
        stream_size = len(contents.get_data())
        expanded += stream_size
        if stream_size > 8_000_000 or expanded > max_expanded:
            raise ValueError("Expanded PDF content ceiling exceeded")
    text = (page.extract_text() or "")[:remaining]
    pages.append({"page": index + 1, "text": text})
    remaining -= len(text)
usage = resource.getrusage(resource.RUSAGE_SELF)
print(json.dumps({"pages": pages, "totalPages": len(reader.pages), "truncated": len(pages) < len(reader.pages) or remaining <= 0,
                  "metrics": {"wallMs": round((time.monotonic()-started)*1000), "cpuSeconds": usage.ru_utime+usage.ru_stime,
                              "peakRSSBytes": usage.ru_maxrss*1024, "expandedBytes": expanded}}))
