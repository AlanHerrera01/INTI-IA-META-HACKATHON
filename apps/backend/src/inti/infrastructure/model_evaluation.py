"""Single-call synthetic calibration; no desktop data or OS actions."""

import base64
import secrets
import struct
import zlib

from pydantic import BaseModel, ConfigDict, Field

from inti.infrastructure.meta import MetaModelAPIAdapter


class CalibrationPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    x: int = Field(ge=0, le=511)
    y: int = Field(ge=0, le=319)


def calibration_image() -> tuple[str, tuple[int, int, int, int]]:
    left, top = 40 + secrets.randbelow(300), 30 + secrets.randbelow(180)
    right, bottom = left + 100, top + 70
    rows = bytearray()
    for y in range(320):
        rows.append(0)
        for x in range(512):
            rows.extend((40, 220, 100) if left <= x < right and top <= y < bottom else (18, 24, 36))

    def chunk(name: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data)) + name + data + struct.pack("!I", zlib.crc32(name + data))
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack("!2I5B", 512, 320, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(rows)))
        + chunk(b"IEND", b"")
    )
    return base64.b64encode(png).decode("ascii"), (left, top, right, bottom)


async def evaluate_model(model: MetaModelAPIAdapter) -> dict:
    image, bounds = calibration_image()
    await model.complete_schema(
        CalibrationPoint,
        "Locate the green rectangle in the provided synthetic image. "
        "Return an integer pixel coordinate inside it. Origin is the top left.",
        "Image dimensions: 512 by 320 pixels. Return only x and y using the schema.",
        image_base64=image,
        max_tokens=512,
        max_retries=0,
        evaluation_bounds=bounds,
    )
    return await model.status()
