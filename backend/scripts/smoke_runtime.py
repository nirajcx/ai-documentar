"""Exercise running HTTP API + beat/Redis/worker + real models. Clean up own test data."""

import asyncio
import json
import secrets
import time
from io import BytesIO
from uuid import UUID, uuid4

import httpx
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from sqlalchemy import delete

from app.db.models.chat import Chat
from app.db.models.document import Document
from app.db.models.user import User
from app.db.session import SessionLocal, engine
from app.services.storage.s3_service import S3Service

BASE = "http://localhost:8001/api/v1"


def sample_pdf():
    writer = PdfWriter()
    page = writer.add_blank_page(width=600, height=800)
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
    )
    content = DecodedStreamObject()
    content.set_data(
        b"BT /F1 12 Tf 50 700 Td (Employees receive 20 days of annual leave each year.) Tj ET"
    )
    page[NameObject("/Contents")] = writer._add_object(content)
    stream = BytesIO()
    writer.write(stream)
    return stream.getvalue()


async def main():
    created_users = []
    document_id = None
    headers = {}
    async with httpx.AsyncClient(base_url=BASE, timeout=180) as client:
        try:
            for _attempt in range(30):
                response = await client.get("/ready")
                if response.status_code == 200:
                    break
                await asyncio.sleep(2)
            response.raise_for_status()
            print("Readiness:", response.json())
            accounts = []
            for _ in range(2):
                unique = uuid4().hex
                credentials = {
                    "email": f"rag-smoke-{unique}@example.com",
                    "password": secrets.token_urlsafe(24),
                }
                response = await client.post(
                    "/auth/register", json={**credentials, "username": "rag_smoke_" + unique}
                )
                response.raise_for_status()
                created_users.append(UUID(response.json()["id"]))
                response = await client.post("/auth/login", json=credentials)
                response.raise_for_status()
                assert "Secure" in response.headers["set-cookie"]
                accounts.append({"Authorization": "Bearer " + response.json()["session_token"]})
            headers = accounts[0]
            response = await client.get("/documents/capabilities", headers=headers)
            assert response.json()["chat_ready"] is True
            response = await client.post(
                "/documents",
                headers=headers,
                files={"file": ("smoke-policy.pdf", sample_pdf(), "application/pdf")},
            )
            response.raise_for_status()
            assert response.status_code == 202
            document_id = response.json()["id"]
            started = time.monotonic()
            transitions = []
            for _ in range(120):
                response = await client.get("/documents", headers=headers)
                response.raise_for_status()
                doc = next(d for d in response.json() if d["id"] == document_id)
                if not transitions or transitions[-1] != doc["status"]:
                    transitions.append(doc["status"])
                if doc["status"] in {"ready", "failed", "needs_ocr"}:
                    break
                await asyncio.sleep(2)
            assert doc["status"] == "ready", doc
            print(
                "Actual queue indexing:",
                transitions,
                "seconds:",
                round(time.monotonic() - started, 1),
            )
            assert (
                await client.get(f"/documents/{document_id}/file", headers=accounts[1])
            ).status_code == 404
            response = await client.get(f"/documents/{document_id}/file", headers=headers)
            assert response.headers["content-type"] == "application/pdf"
            assert response.content.startswith(b"%PDF-")
            response = await client.post("/conversations", headers=headers, json={"title": "Smoke"})
            response.raise_for_status()
            chat_id = response.json()["id"]
            response = await client.post(
                f"/conversations/{chat_id}/messages/stream",
                headers=headers,
                json={
                    "request_id": str(uuid4()),
                    "message": "How many annual leave days do employees receive?",
                    "rag": {"enabled": True, "document_ids": [document_id]},
                },
            )
            response.raise_for_status()
            events = [
                json.loads(line[6:])
                for line in response.text.splitlines()
                if line.startswith("data: ")
            ]
            assert events[-1].get("done"), events[-1]
            citations = next(e["citations"] for e in events if "citations" in e)
            assert citations[0]["document_id"] == document_id and citations[0]["page_start"] == 1
            response = await client.get(f"/conversations/{chat_id}", headers=headers)
            answer = response.json()["messages"][-1]
            assert answer["citations"] == citations and "20" in answer["content"]
            response = await client.delete(f"/documents/{document_id}", headers=headers)
            assert response.status_code == 204
            assert (
                await client.get(f"/documents/{document_id}/file", headers=headers)
            ).status_code == 404
            response = await client.get(f"/conversations/{chat_id}", headers=headers)
            assert response.json()["messages"][-1]["citations"] == citations
            assert (await client.post("/auth/logout", headers=headers)).status_code == 200
            assert (await client.get("/auth/me", headers=headers)).status_code == 401
            print(
                "PASS: login, upload, beat/Redis/worker, retrieval, generation, "
                "citations, history, PDF, ownership, delete, logout"
            )
        finally:
            # Clean only IDs created by this run. No pre-existing accounts/documents are touched.
            async with SessionLocal() as db:
                if document_id:
                    doc = await db.get(Document, UUID(document_id))
                    if doc and doc.user_id in created_users:
                        await S3Service().delete(doc.object_key)
                        await db.delete(doc)
                await db.execute(delete(Chat).where(Chat.user_id.in_(created_users)))
                await db.execute(delete(User).where(User.id.in_(created_users)))
                await db.commit()
            await engine.dispose()
            print("Synthetic accounts and document cleaned up.")


if __name__ == "__main__":
    asyncio.run(main())
