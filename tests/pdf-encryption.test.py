"""Regression for the actual Kannapolis AES packet failure; no network."""
import importlib.util, io, pathlib, unittest
from pypdf import PdfWriter

spec = importlib.util.spec_from_file_location("extractor", pathlib.Path(__file__).parents[1] / "scripts/extract-agenda-pdf.py")
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


def encrypted(password):
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.encrypt(password, owner_password="owner-only", algorithm="AES-256")
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


class PublicEncryptionTests(unittest.TestCase):
    def test_public_aes_packet_opens_without_a_password(self):
        result = extractor.extract(encrypted(""), 200, 1_000_000, 64_000_000)
        self.assertEqual(result["totalPages"], 1)
        self.assertFalse(result["truncated"])

    def test_private_password_is_never_guessed_or_bypassed(self):
        with self.assertRaisesRegex(ValueError, "Password-protected"):
            extractor.public_reader(encrypted("private-password"))

    def test_malformed_document_still_fails(self):
        with self.assertRaises(Exception):
            extractor.public_reader(b"%PDF-1.4\nmalformed")


if __name__ == "__main__":
    unittest.main()
