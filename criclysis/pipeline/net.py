"""Polite, cached HTTP access.

Every network call in this project goes through :func:`get`. That gives us one
place to enforce the things that keep a scraper welcome:

* an honest, identifiable User-Agent
* a robots.txt check per host, cached for the run
* a minimum delay between requests to the same host
* on-disk caching so a re-run costs zero requests
* exponential backoff that respects ``Retry-After``
"""
from __future__ import annotations

import gzip
import hashlib
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

from .config import NET, RAW_DIR

log = logging.getLogger(__name__)

_last_request: dict[str, float] = {}
_robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}


class Blocked(RuntimeError):
    """Raised when robots.txt disallows a URL."""


class FetchError(RuntimeError):
    """Raised when a URL could not be retrieved after retries."""


def _host(url: str) -> str:
    return urllib.parse.urlsplit(url).netloc


def _throttle(host: str, delay: float | None = None) -> None:
    """Block until at least ``delay`` seconds have passed since the last hit."""
    delay = NET.delay_seconds if delay is None else delay
    last = _last_request.get(host)
    if last is not None:
        wait = delay - (time.monotonic() - last)
        if wait > 0:
            time.sleep(wait)
    _last_request[host] = time.monotonic()


def _robots_for(url: str) -> urllib.robotparser.RobotFileParser | None:
    """Fetch and cache the robots.txt for the URL's host.

    A host that does not serve a robots.txt is treated as permitting access,
    which is the behaviour the standard prescribes. A host we cannot reach at
    all is treated as *disallowed* so that a network fault never silently turns
    into an unchecked crawl.
    """
    host = _host(url)
    if host in _robots:
        return _robots[host]

    parts = urllib.parse.urlsplit(url)
    robots_url = f"{parts.scheme}://{host}/robots.txt"
    parser = urllib.robotparser.RobotFileParser()
    parser.set_url(robots_url)
    try:
        _throttle(host)
        req = urllib.request.Request(robots_url, headers={"User-Agent": NET.user_agent})
        with urllib.request.urlopen(req, timeout=NET.timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
        parser.parse(body.splitlines())
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            # Explicitly protected: treat the whole site as off limits.
            parser.disallow_all = True
        else:
            parser.allow_all = True
    except Exception as exc:  # noqa: BLE001 - network faults of every shape
        log.warning("could not read %s (%s); treating host as disallowed", robots_url, exc)
        parser = None
    _robots[host] = parser
    return parser


def allowed(url: str) -> bool:
    """Return True if robots.txt permits our user-agent to fetch ``url``."""
    if not NET.respect_robots:
        return True
    parser = _robots_for(url)
    if parser is None:
        return False
    return parser.can_fetch(NET.user_agent, url)


def crawl_delay(url: str) -> float:
    """Delay requested by the host, or our configured floor - whichever is larger."""
    parser = _robots_for(url) if NET.respect_robots else None
    if parser is None:
        return NET.delay_seconds
    try:
        declared = parser.crawl_delay(NET.user_agent)
    except Exception:  # noqa: BLE001 - older parsers raise on odd input
        declared = None
    return max(NET.delay_seconds, float(declared or 0))


def cache_path(url: str, suffix: str = "") -> Path:
    digest = hashlib.sha256(url.encode()).hexdigest()[:20]
    host = _host(url).replace(":", "_") or "local"
    name = f"{digest}{suffix}.bin"
    return RAW_DIR / host / name


def get(url: str, *, binary: bool = False, use_cache: bool = True,
        headers: dict[str, str] | None = None) -> bytes | str:
    """Fetch ``url``, using the on-disk cache when possible.

    Raises :class:`Blocked` when robots.txt disallows the URL and
    :class:`FetchError` when the request fails after all retries.
    """
    path = cache_path(url)
    if use_cache and path.exists():
        raw = path.read_bytes()
        return raw if binary else raw.decode("utf-8", "replace")

    if not allowed(url):
        raise Blocked(
            f"robots.txt at {_host(url)} disallows {url} for user-agent "
            f"{NET.user_agent!r}. Nothing was requested."
        )

    request_headers = {
        "User-Agent": NET.user_agent,
        "Accept-Encoding": "gzip",
        "Accept": "*/*",
    }
    request_headers.update(headers or {})

    delay = crawl_delay(url)
    last_error: Exception | None = None
    for attempt in range(NET.max_retries):
        if attempt:
            wait = NET.backoff_base ** attempt
            log.info("retry %d for %s in %.0fs", attempt, url, wait)
            time.sleep(wait)
        _throttle(_host(url), delay)
        try:
            req = urllib.request.Request(url, headers=request_headers)
            with urllib.request.urlopen(req, timeout=NET.timeout) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
            return raw if binary else raw.decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code in (403, 401, 404, 410):
                # Not transient. Stop immediately rather than hammering.
                raise FetchError(f"{url} returned HTTP {exc.code}") from exc
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            if retry_after and retry_after.isdigit():
                time.sleep(min(120, int(retry_after)))
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    raise FetchError(f"could not fetch {url}: {last_error}")


def download(url: str, dest: Path, *, use_cache: bool = True) -> Path:
    """Download a (potentially large) file to ``dest``."""
    if use_cache and dest.exists() and dest.stat().st_size > 0:
        log.info("using cached %s", dest.name)
        return dest
    data = get(url, binary=True, use_cache=use_cache)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)  # type: ignore[arg-type]
    return dest
