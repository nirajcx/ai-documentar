import asyncio

import boto3
from botocore.config import Config

from app.core.config import get_settings


class S3Service:
    def __init__(self):
        s = get_settings()
        self.bucket = s.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint_url,
            region_name=s.s3_region,
            aws_access_key_id=s.s3_access_key_id.get_secret_value(),
            aws_secret_access_key=s.s3_secret_access_key.get_secret_value(),
            config=Config(connect_timeout=5, read_timeout=30, retries={"max_attempts": 2}),
        )

    async def put(self, key: str, data: bytes):
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType="application/pdf",
        )

    async def get(self, key: str) -> bytes:
        def read():
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            try:
                return response["Body"].read(25 * 1024 * 1024 + 1)
            finally:
                response["Body"].close()

        return await asyncio.to_thread(read)

    async def delete(self, key: str):
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)
