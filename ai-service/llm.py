"""
Provider-agnostic LLM access for the SmartPM AI service.

Both Ollama (local) and Google Gemini expose an OpenAI-compatible REST surface, so a
single `openai` client covers both — we only swap base_url / api_key / model via env.
Chat and embeddings choose their provider independently. Embeddings default to the local
model on purpose: all stored vectors must come from ONE embedding model or cosine
similarity compares apples to oranges, so switching the embed provider means re-indexing.
"""

from __future__ import annotations

import json
import os
import re

from openai import OpenAI

# --- Provider config (read once at import) ----------------------------------------

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/"
)

CHAT_PROVIDER = os.getenv("AI_CHAT_PROVIDER", "ollama").strip().lower()
EMBED_PROVIDER = os.getenv("AI_EMBED_PROVIDER", "ollama").strip().lower()

OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "qwen2.5:3b")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
GEMINI_CHAT_MODEL = os.getenv("GEMINI_CHAT_MODEL", "gemini-3.5-flash")
GEMINI_EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "text-embedding-004")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()


def _client(provider: str) -> OpenAI:
    if provider == "gemini":
        if not GEMINI_API_KEY:
            raise RuntimeError(
                "AI provider is 'gemini' but GEMINI_API_KEY is not set. "
                "Add it to ai-service/.env or switch the provider back to 'ollama'."
            )
        return OpenAI(base_url=GEMINI_BASE_URL, api_key=GEMINI_API_KEY)
    # Ollama ignores the key but the client requires a non-empty value.
    return OpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama")


def chat_target(provider: str | None = None) -> tuple[OpenAI, str]:
    # An explicit per-request provider (set by Node's Settings toggle) wins over the env default.
    p = (provider or CHAT_PROVIDER).strip().lower()
    model = GEMINI_CHAT_MODEL if p == "gemini" else OLLAMA_CHAT_MODEL
    return _client(p), model


def embed_target() -> tuple[OpenAI, str]:
    model = GEMINI_EMBED_MODEL if EMBED_PROVIDER == "gemini" else OLLAMA_EMBED_MODEL
    return _client(EMBED_PROVIDER), model


# Gemini 3.x models spend part of the completion budget on internal "thinking" before
# emitting the answer, so a limit sized for the local model can starve the visible output
# (it comes back truncated mid-JSON). Raise the floor for Gemini only; Ollama keeps the
# tighter budget since it has no hidden reasoning phase.
GEMINI_MIN_OUTPUT_TOKENS = 2000


def budget(provider: str | None, requested: int) -> int:
    p = (provider or CHAT_PROVIDER).strip().lower()
    return max(requested, GEMINI_MIN_OUTPUT_TOKENS) if p == "gemini" else requested


# Only Gemini can see. The local Ollama models this app ships with (qwen2.5:3b,
# nomic-embed-text) are text-only, so callers must check this before sending an image
# rather than letting the request fail deep inside the provider.
VISION_PROVIDERS = {"gemini"}


def supports_vision(provider: str | None = None) -> bool:
    return (provider or CHAT_PROVIDER).strip().lower() in VISION_PROVIDERS


def provider_info() -> dict:
    return {
        "chatProvider": CHAT_PROVIDER,
        "chatModel": GEMINI_CHAT_MODEL if CHAT_PROVIDER == "gemini" else OLLAMA_CHAT_MODEL,
        "embedProvider": EMBED_PROVIDER,
        "embedModel": GEMINI_EMBED_MODEL if EMBED_PROVIDER == "gemini" else OLLAMA_EMBED_MODEL,
        "geminiKeyPresent": bool(GEMINI_API_KEY),
    }


# --- Embeddings ---------------------------------------------------------------------


def embed(text: str) -> list[float]:
    client, model = embed_target()
    resp = client.embeddings.create(model=model, input=text)
    return list(resp.data[0].embedding)


# --- JSON chat completion (structured output) ---------------------------------------

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


# Malformations seen in practice from Gemini on long JSON values: a dangling quote on its
# own line (it closes a string it already closed), a trailing comma, or output that simply
# ran out of token budget mid-object.
_STRAY_QUOTE_LINE = re.compile(r'^[ \t]*"[ \t]*,?[ \t]*$\r?\n?', re.MULTILINE)
_TRAILING_COMMA = re.compile(r",\s*([}\]])")


def _repair_json(text: str) -> str:
    """Patch the common, mechanical ways a model breaks otherwise-good JSON."""
    out = _STRAY_QUOTE_LINE.sub("", text)
    out = _TRAILING_COMMA.sub(r"\1", out).rstrip()

    # An unterminated final string (truncated output) needs closing before its container.
    if out.count('"') - out.count('\\"') % 2 == 1 or (out.count('"') % 2 == 1):
        out += '"'
    out += "}" * max(0, out.count("{") - out.count("}"))
    out += "]" * max(0, out.count("[") - out.count("]"))
    return out


def _first_json_object(text: str) -> dict | None:
    """
    Decode the first complete JSON object and ignore whatever follows.

    This is what catches trailing garbage — a duplicated closing brace, a second object,
    or a sentence of commentary after the JSON. Slicing to the LAST '}' cannot handle
    those, because the stray tail gets pulled inside the slice.
    """
    start = text.find("{")
    if start == -1:
        return None
    try:
        parsed, _ = json.JSONDecoder().raw_decode(text[start:])
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _extract_json(text: str) -> dict | None:
    """Best-effort recovery when a model wraps JSON in prose, fences, or mangles it."""
    if not text:
        return None
    stripped = _FENCE.sub("", text.strip())

    # Cheap exact parse first, then trailing-garbage tolerance, then structural repair.
    try:
        parsed = json.loads(stripped)
        if isinstance(parsed, dict):
            return parsed
    except (json.JSONDecodeError, ValueError):
        pass

    direct = _first_json_object(stripped)
    if direct is not None:
        return direct

    start, end = stripped.find("{"), stripped.rfind("}")
    slice_ = stripped[start : end + 1] if start != -1 and end > start else stripped
    for candidate in (_repair_json(stripped), _repair_json(slice_)):
        repaired = _first_json_object(candidate)
        if repaired is not None:
            return repaired
    return None


def complete_json(
    system: str,
    prompt: str,
    *,
    provider: str | None = None,
    max_tokens: int = 700,
    temperature: float = 0.2,
) -> dict | None:
    """
    Ask the chat model for a single JSON object and parse it. Returns None if the model
    could not produce valid JSON after a retry — callers (and ultimately the Node layer)
    have deterministic fallbacks, so a miss here degrades gracefully rather than erroring.
    """
    client, model = chat_target(provider)
    max_tokens = budget(provider, max_tokens)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]

    for attempt in range(2):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
        except Exception:
            # Some model/endpoint combos reject response_format — retry plain.
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        content = resp.choices[0].message.content or ""
        print(f"[llm raw] model={model} attempt={attempt} content={content!r}")
        data = _extract_json(content)
        if data is not None:
            return data

        # Nudge once with the malformed output in context, then give up to the fallback.
        messages.append({"role": "assistant", "content": content})
        messages.append(
            {
                "role": "user",
                "content": "That was not valid JSON. Reply with ONLY the JSON object — "
                "no prose, no markdown, no code fences.",
            }
        )

    return None


# --- Multimodal JSON completion ------------------------------------------------------


def complete_json_vision(
    system: str,
    prompt: str,
    image_base64: str,
    mime: str,
    *,
    provider: str | None = None,
    max_tokens: int = 900,
    temperature: float = 0.1,
) -> tuple[dict | None, str]:
    """
    Single multimodal request: text prompt + one inline image, JSON object back.

    The image travels as a base64 data URI in the OpenAI-compatible `image_url` content
    part, which Gemini's compat endpoint accepts directly — no file upload step and no
    second provider. Returns (parsed_json_or_None, model_name); raises only if the caller
    asked for a provider that cannot see, which is a programming error the caller should
    have prevented with supports_vision().
    """
    if not supports_vision(provider):
        raise ValueError(f"Provider {provider or CHAT_PROVIDER!r} has no vision support")

    client, model = chat_target(provider)
    max_tokens = budget(provider, max_tokens)
    messages: list[dict] = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_base64}"}},
            ],
        },
    ]

    for attempt in range(2):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
        except Exception:
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        content = resp.choices[0].message.content or ""
        print(f"[vision raw] model={model} attempt={attempt} content={content!r}")
        data = _extract_json(content)
        if data is not None:
            return data, model

        messages.append({"role": "assistant", "content": content})
        messages.append(
            {
                "role": "user",
                "content": "That was not valid JSON. Reply with ONLY the JSON object — "
                "no prose, no markdown, no code fences.",
            }
        )

    return None, model


# --- Output language --------------------------------------------------------------------

LANGUAGE_NAMES = {"id": "Bahasa Indonesia", "en": "English"}


def language_clause(lang: str | None) -> str:
    """
    Instruction appended to a system prompt so the model answers in the user's language.

    Returns an empty string for English so existing prompts stay byte-identical to before:
    the English path is the one every prompt was tuned and tested against, and it should
    not change just because this feature exists.

    Proper nouns are exempted deliberately. Machine names, inspection-point labels, part
    numbers and checksheet codes are what is physically printed on the plant floor, so
    translating them would make the output harder to act on, not easier.
    """
    code = (lang or "en").strip().lower()[:2]
    if code != "id":
        return ""
    return (
        "\n\nIMPORTANT - LANGUAGE: Write your entire response in Bahasa Indonesia. "
        "Keep these EXACTLY as given, untranslated: machine names, inspection point labels, "
        "part names and part numbers, vendor names, checksheet codes (CS-####), request "
        "codes (PR-###), and any JSON keys. Translate only your own prose. "
        "Use Indonesian number formatting for currency (Rp 1.850.000)."
    )
