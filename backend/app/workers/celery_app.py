from celery import Celery

from app.core.config import get_settings

celery_app = Celery("documentar", broker=get_settings().redis_url.get_secret_value())
celery_app.conf.update(
    task_default_queue="documentar",
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_ignore_result=True,
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)
celery_app.conf.update(
    imports=("app.workers.tasks.index_document",),
    beat_schedule={"dispatch-documents": {"task": "documents.dispatch", "schedule": 15.0}},
    worker_prefetch_multiplier=1,
    broker_connection_timeout=5,
    task_publish_retry=False,
)
