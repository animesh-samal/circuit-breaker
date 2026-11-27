"""What may be saved to the public site.

The link rules matter most: these values end up in an href on a page everyone
visits, so a `javascript:` link that got through would run in a visitor's browser.
"""

from typing import Any

import pytest
from pydantic import ValidationError

from app.core.content_model import Project, SiteContent


def _project(**overrides: Any) -> dict[str, Any]:
    base = {"id": "demo", "tag": "03 · Demo", "title": "Demo", "blurb": "What it does."}
    return {**base, **overrides}


def test_a_minimal_project_is_valid_and_fills_in_defaults() -> None:
    project = Project(**_project())
    assert project.stack == []
    assert project.hidden is False
    assert project.source is None


@pytest.mark.parametrize(
    "link",
    [
        "https://github.com/animesh-samal/x",
        "/infrastructure",
        "/blog/some-post",
        "https://a.io/b?c=1",
    ],
)
def test_safe_links_are_accepted(link: str) -> None:
    assert Project(**_project(source=link, live=link)).source == link


@pytest.mark.parametrize(
    "link",
    [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:x",
        "http://insecure.example",
        "//evil.example/path",
        "https://",
        "ftp://x.example",
        "mailto:a@b.c",
        "/has a space",
        "https://x.io/\nnewline",
        "https://x.io/" + "a" * 400,
        "relative/path",
    ],
)
def test_unsafe_links_are_rejected(link: str) -> None:
    with pytest.raises(ValidationError):
        Project(**_project(source=link))


def test_a_tagline_is_optional_and_short() -> None:
    assert Project(**_project()).tagline is None
    assert Project(**_project(tagline="A site that watches itself run.")).tagline is not None
    with pytest.raises(ValidationError):
        Project(**_project(tagline="x" * 91))


def test_text_is_trimmed() -> None:
    assert Project(**_project(title="  Padded  ")).title == "Padded"


def test_empty_required_text_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Project(**_project(title="   "))


def test_overlong_text_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Project(**_project(blurb="x" * 1501))


@pytest.mark.parametrize("bad_id", ["", "Has Caps", "has space", "-leading", "a" * 41, "../escape"])
def test_a_project_id_must_be_a_short_slug(bad_id: str) -> None:
    with pytest.raises(ValidationError):
        Project(**_project(id=bad_id))


def test_unknown_fields_are_rejected_instead_of_dropped() -> None:
    with pytest.raises(ValidationError):
        Project(**_project(colour="red"))


def test_a_document_may_be_partial() -> None:
    assert SiteContent().model_dump(exclude_none=True) == {}


def test_duplicate_project_ids_are_detected() -> None:
    doc = SiteContent(projects=[Project(**_project()), Project(**_project(title="Other"))])
    assert not doc.unique_project_ids()


def test_list_sizes_are_limited() -> None:
    with pytest.raises(ValidationError):
        SiteContent(projects=[Project(**_project(id=f"p{i}")) for i in range(41)])


def test_the_journey_cannot_be_emptied() -> None:
    with pytest.raises(ValidationError):
        SiteContent(journey=[])


def test_a_journey_stop_needs_a_known_icon() -> None:
    stop = {"when": "2026", "title": "T", "place": "P", "text": "X", "icon": "rocket"}
    with pytest.raises(ValidationError):
        SiteContent(journey=[stop])  # type: ignore[list-item]
