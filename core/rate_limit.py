"""Shared strict sliding-window rate limiting primitives."""

from __future__ import annotations

import asyncio
import time
from collections import deque


class StrictSlidingWindowLimiter:
    """Strict sliding window limiter.

    Guarantees: at most ``rate_limit`` acquisitions in any interval of length
    ``rate_window`` (seconds).

    Implemented as an async context manager so call sites can do::

        async with limiter:
            ...
    """

    def __init__(self, rate_limit: int, rate_window: float) -> None:
        if rate_limit <= 0:
            raise ValueError("rate_limit must be > 0")
        if rate_window <= 0:
            raise ValueError("rate_window must be > 0")

        self._rate_limit = int(rate_limit)
        self._rate_window = float(rate_window)
        self._times: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            # Fast path: check if we can acquire without locking
            now = time.monotonic()
            cutoff = now - self._rate_window

            # Clean up expired entries without lock if possible
            # We need to be careful here - we'll do a quick check and then
            # acquire the lock only if we need to modify the deque or are uncertain

            async with self._lock:
                # Re-check conditions under lock
                now = time.monotonic()  # Re-check time after acquiring lock
                cutoff = now - self._rate_window

                while self._times and self._times[0] <= cutoff:
                    self._times.popleft()

                if len(self._times) < self._rate_limit:
                    self._times.append(now)
                    return

                oldest = self._times[0]
                wait_time = max(0.0, (oldest + self._rate_window) - now)

            if wait_time > 0:
                await asyncio.sleep(wait_time)
            else:
                await asyncio.sleep(0)

    async def __aenter__(self) -> StrictSlidingWindowLimiter:
        await self.acquire()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False
