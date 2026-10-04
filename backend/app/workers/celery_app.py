from celery import Celery

from app.core.config import get_settings

celery_app = Celery("documentar", broker=get_settings().redis_url.get_secret_value())
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_ignore_result=True,
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)
# Register real ingestion tasks here when implemented. No sample jobs are scheduled.
