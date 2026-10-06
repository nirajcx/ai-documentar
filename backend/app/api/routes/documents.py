from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, UploadFile

from app.api.dependencies import CurrentUser
from app.core.config import get_settings
from app.db.session import DB
from app.schemas.document import DocumentOut
from app.services.document_service import DocumentService

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/capabilities")
async def capabilities(user: CurrentUser):
    return {"chat_ready": get_settings().rag_enabled}


@router.get("", response_model=list[DocumentOut])
async def list_documents(user: CurrentUser, db: DB):
    return await DocumentService(db).repo.list(user.id)


@router.post("", response_model=DocumentOut, status_code=202)
async def upload(file: UploadFile, response: Response, user: CurrentUser, db: DB):
    try:
        doc, created = await DocumentService(db).upload(user.id, file)
        response.status_code = 202 if created else 200
        return doc
    finally:
        await file.close()


@router.get("/{document_id}/file")
async def original(document_id: UUID, user: CurrentUser, db: DB):
    service = DocumentService(db)
    try:
        doc = await service.repo.get(user.id, document_id)
        data = await service.storage.get(doc.object_key)
        return Response(
            data,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "inline; filename*=UTF-8''" + quote(doc.filename, safe=""),
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/{document_id}/retry", response_model=DocumentOut)
async def retry(document_id: UUID, user: CurrentUser, db: DB):
    try:
        return await DocumentService(db).retry(user.id, document_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.delete("/{document_id}", status_code=204)
async def delete(document_id: UUID, user: CurrentUser, db: DB):
    try:
        await DocumentService(db).delete(user.id, document_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
