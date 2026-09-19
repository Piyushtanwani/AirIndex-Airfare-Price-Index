"""A grounded question-answering layer over the index.

The design constraint that matters: the language model is never the source of a number.

Every figure a user sees comes from a query against the database, assembled here into an
evidence block. The model's only job is to select from that evidence and phrase it. If a
question cannot be answered from the evidence, the answer says so instead of producing a
plausible figure, and the system prompt is written to make that the easy path.

Two modes, and the same grounding rule applies to both:

  deterministic  The default. Intent is matched against a small set of question shapes and
                 the answer is composed from the evidence directly. No model, no API key,
                 no possibility of a fabricated number. Slightly stilted, always correct.

  model          Used when an Anthropic API key is configured. The same evidence block is
                 handed to Claude with instructions to use only what is in it. The reply
                 carries the evidence it was given, so a reader can check every figure.

A demonstration that quietly falls back to a language model inventing statistics would be
worse than having no assistant at all, which is why the deterministic path is the default
rather than the fallback.
"""

from __future__ import annotations

import datetime as dt
import os
import re
from dataclasses import dataclass, field
from typing import Any

MODEL = "claude-opus-5"

SYSTEM_PROMPT = """\
You are the analyst interface to AirIndex, a real-time airfare price index for India built
for the Ministry of Statistics and Programme Implementation. You answer questions about the
published index.

Absolute rules, in order of precedence:

1. Every number you state must appear in the EVIDENCE block of the user's message. Never
   compute a new figure, never estimate, never recall a number from anywhere else.
2. If the evidence does not contain what the question needs, say exactly what is missing
   and stop. An incomplete answer is correct; an invented one is not.
3. When the evidence says the underlying data is synthetic, say so in your first sentence.
   The index then demonstrates a method and measures nothing.
4. Never give investment, booking or purchasing advice. This is a statistical instrument,
   not a fare comparison service. If asked when to book, explain that the index measures
   price level over time and does not forecast an individual fare.
5. Quote the methodology version and the as-of date when you state an index value.

Style: plain English, no bullet lists unless the question asks for several items, no
markdown headers, under 150 words. Write for a statistician who has not seen the dashboard.
"""


@dataclass
class Evidence:
    """Everything the answer is allowed to draw on."""

    sections: dict[str, Any] = field(default_factory=dict)

    def add(self, name: str, value: Any) -> None:
        self.sections[name] = value

    def render(self) -> str:
        lines = ["EVIDENCE"]
        for name, value in self.sections.items():
            lines.append(f"\n[{name}]")
            lines.append(_render_value(value))
        return "\n".join(lines)


def _render_value(value: Any, indent: int = 0) -> str:
    pad = "  " * indent
    if isinstance(value, dict):
        return "\n".join(
            f"{pad}{k}: {_render_value(v, 0) if not isinstance(v, (dict, list)) else ''}"
            + (
                "\n" + _render_value(v, indent + 1)
                if isinstance(v, (dict, list))
                else ""
            )
            for k, v in value.items()
        )
    if isinstance(value, list):
        return "\n".join(f"{pad}- {_render_value(v, 0)}" for v in value[:20])
    if isinstance(value, float):
        return f"{value:,.4f}".rstrip("0").rstrip(".")
    return f"{value}"


@dataclass
class AnalystAnswer:
    answer: str
    mode: str
    evidence: dict[str, Any]
    grounded: bool = True
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "answer": self.answer,
            "mode": self.mode,
            "grounded": self.grounded,
            "evidence": self.evidence,
            "notes": self.notes,
        }


# ---------------------------------------------------------------------------
# Intent matching for the deterministic path
# ---------------------------------------------------------------------------

# Order matters. The booking-advice guard is first because a question such as "should I
# book now?" also matches the "level" pattern, and a refusal that a more eager pattern can
# shadow is not a refusal.
INTENT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("booking", re.compile(
        r"(should i (book|buy|fly)|when (to|should i) (book|buy|fly)|"
        r"best time to (book|buy|fly)|worth booking|book (now|today)|"
        r"cheapest (time|day) to)",
        re.I,
    )),
    ("level", re.compile(r"\b(what is|current|latest|today|level|value|now)\b", re.I)),
    ("movers", re.compile(r"\b(mover|biggest|most|rose|fell|which route|fastest)\b", re.I)),
    ("trust", re.compile(r"\b(trust|reliable|believe|confiden|quality|accurate)\b", re.I)),
    ("method", re.compile(r"\b(method|formula|how.*(comput|calculat)|jevons|weight)\b", re.I)),
    ("forecast", re.compile(r"\b(forecast|predict|next|outlook|will|future)\b", re.I)),
    ("why", re.compile(r"\b(why|driver|cause|explain|contribut)\b", re.I)),
]


def classify(question: str) -> str:
    for name, pattern in INTENT_PATTERNS:
        if pattern.search(question):
            return name
    return "unknown"


def answer_deterministically(question: str, evidence: Evidence) -> str:
    """Compose an answer from the evidence without a model."""
    intent = classify(question)
    sections = evidence.sections
    latest = sections.get("latest_index") or {}
    method = sections.get("methodology") or {}
    synthetic = bool(sections.get("data_is_synthetic"))

    prefix = ""
    if synthetic:
        prefix = (
            "The underlying observations are synthetic, so this demonstrates the method "
            "and does not measure Indian airfares. "
        )

    if intent == "booking":
        return (
            "AirIndex measures the level of airfares over time for statistical purposes. "
            "It does not forecast the fare on an individual flight and it is not a "
            "booking tool, so it cannot tell you when to buy a ticket."
        )

    if intent == "level" and latest:
        parts = [
            f"{prefix}The airfare price index stood at {latest.get('apix')} on "
            f"{latest.get('date')}, against a base period of 100."
        ]
        if latest.get("wow_pct") is not None:
            parts.append(f"That is {latest['wow_pct']:+.1f} per cent on the week.")
        if latest.get("mom_pct") is not None:
            parts.append(f"It is {latest['mom_pct']:+.1f} per cent on the month.")
        parts.append(
            f"Coverage was {float(latest.get('coverage', 0)):.0%} of the basket by weight, "
            f"computed under methodology {method.get('methodology_version', 'unknown')}."
        )
        return " ".join(parts)

    if intent == "movers":
        movers = sections.get("top_movers") or []
        if not movers:
            return "No route movements are available in the evidence supplied."
        lines = [f"{prefix}The largest weekly route movements were:"]
        for mover in movers[:5]:
            lines.append(
                f"{mover.get('code')} at {mover.get('apix')}, "
                f"{float(mover.get('wow_pct') or 0):+.1f} per cent on the week."
            )
        return " ".join(lines)

    if intent == "trust":
        trust = sections.get("trust") or {}
        if not trust:
            return "No trust assessment is available in the evidence supplied."
        overall = trust.get("overall")
        band = trust.get("band")
        text = (
            f"The data trust score is {overall} out of 100, which places the series in "
            f"the '{band}' band."
        )
        warnings = trust.get("warnings") or []
        if warnings:
            text += " " + warnings[0]
        return text

    if intent == "method":
        return (
            f"The index is a {method.get('index_type', 'weighted Jevons index')}. "
            f"The formula is {method.get('formula', 'unavailable')}. "
            f"Prices are {method.get('price_basis', 'unknown')}, the base period is "
            f"{method.get('base_period', 'unknown')}, and weights come from "
            f"{method.get('weights_source', 'an unstated source')}."
        )

    if intent == "forecast":
        forecast = sections.get("forecast") or {}
        points = forecast.get("points") or []
        if not points:
            return (
                "No forecast is available in the evidence supplied. A forecast needs at "
                "least sixteen days of published history."
            )
        final = points[-1]
        return (
            f"{prefix}The ensemble projects the index at {final.get('value')} on "
            f"{final.get('date')}, within an interval of {final.get('lower')} to "
            f"{final.get('upper')}. This extrapolates the recent pattern and cannot see "
            "fuel prices, capacity changes or policy."
        )

    if intent == "why":
        contributions = sections.get("contributions") or []
        if not contributions:
            return "No contribution analysis is available in the evidence supplied."
        lines = [f"{prefix}The largest contributions to the recent change were:"]
        for row in contributions[:4]:
            lines.append(
                f"{row.get('cell')} moved {float(row.get('pct_change') or 0):+.1f} per cent, "
                f"contributing {float(row.get('contribution_pct') or 0):+.3f} points."
            )
        return " ".join(lines)

    available = ", ".join(sections.keys()) or "nothing"
    return (
        "That question cannot be answered from the data this system holds. The evidence "
        f"available covers: {available}. Try asking about the current index level, the "
        "largest route movements, the methodology, data trust, the forecast, or what "
        "drove a recent change."
    )


# ---------------------------------------------------------------------------
# Model-backed path
# ---------------------------------------------------------------------------

def answer_with_model(question: str, evidence: Evidence) -> tuple[str, list[str]]:
    """Ask Claude, giving it only the evidence block.

    Raises RuntimeError when the SDK or key is unavailable, so the caller falls back to
    the deterministic path rather than returning nothing.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "The anthropic package is not installed. Install it with "
            "`pip install anthropic` to enable the model-backed analyst."
        ) from exc

    client = anthropic.Anthropic(api_key=api_key)
    notes: list[str] = []

    message = (
        f"{evidence.render()}\n\n"
        f"QUESTION\n{question}\n\n"
        "Answer using only the evidence above."
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        thinking={"type": "adaptive"},
        output_config={"effort": "low"},
        messages=[{"role": "user", "content": message}],
    )

    if response.stop_reason == "refusal":
        raise RuntimeError("The model declined to answer this question.")

    text = "".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise RuntimeError("The model returned no text.")

    notes.append(f"Answered by {MODEL} from the evidence block, which is returned with this reply.")
    return text, notes


def answer(question: str, evidence: Evidence, *, prefer_model: bool = True) -> AnalystAnswer:
    """Answer a question, preferring the model when one is configured."""
    question = (question or "").strip()
    if not question:
        return AnalystAnswer(
            answer="No question was asked.",
            mode="deterministic",
            evidence=evidence.sections,
            notes=[],
        )

    if len(question) > 500:
        return AnalystAnswer(
            answer="That question is too long. Keep it under 500 characters.",
            mode="deterministic",
            evidence=evidence.sections,
        )

    if prefer_model and os.getenv("ANTHROPIC_API_KEY"):
        try:
            text, notes = answer_with_model(question, evidence)
            return AnalystAnswer(
                answer=text, mode="model", evidence=evidence.sections, notes=notes
            )
        except RuntimeError as exc:
            return AnalystAnswer(
                answer=answer_deterministically(question, evidence),
                mode="deterministic",
                evidence=evidence.sections,
                notes=[f"The model path was unavailable, so this answer was composed "
                       f"directly from the data: {exc}"],
            )

    return AnalystAnswer(
        answer=answer_deterministically(question, evidence),
        mode="deterministic",
        evidence=evidence.sections,
        notes=[
            "Composed directly from the data with no language model involved. Set "
            "ANTHROPIC_API_KEY to enable the model-backed phrasing, which reads the same "
            "evidence and is held to the same grounding rules."
        ],
    )


SUGGESTED_QUESTIONS = [
    "What is the airfare index today?",
    "Which routes moved the most this week?",
    "How trustworthy is the current data?",
    "How is the index calculated?",
    "What drove the change over the last week?",
    "What does the forecast say for the next two weeks?",
]


def today() -> dt.date:
    return dt.date.today()
