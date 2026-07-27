from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_soft_time_limit=180,  # 3 minutes: raises exception, task can clean up
    task_time_limit=210,       # 3.5 minutes: hard kill if soft limit ignored
)
