import pytest
from core.translit import (
    cyrillic_to_latin,
    latin_to_cyrillic,
    normalize_uzbek,
    uzbek_search_match,
    get_search_variants,
)

def test_cyrillic_to_latin():
    assert cyrillic_to_latin("Урганч") == "Urganch"
    assert cyrillic_to_latin("Электр") == "Elektr"
    assert cyrillic_to_latin("Ғўзор") == "G'o'zor"

def test_latin_to_cyrillic():
    assert latin_to_cyrillic("Urganch") == "Урганч"
    assert latin_to_cyrillic("Elektr") == "Електр"
    assert latin_to_cyrillic("g'ozor") == "ғозор"

def test_uzbek_search_match():
    # Cyrillic query matches Latin target
    assert uzbek_search_match("Urganch shahri, 12-bino", "урганч") is True
    # Latin query matches Cyrillic target
    assert uzbek_search_match("Урганч шаҳри, 12-бино", "urganch") is True
    # Matching with/without apostrophe
    assert uzbek_search_match("Ғўзор кўчаси", "gozor") is True
    assert uzbek_search_match("Ғўзор кўчаси", "g'ozor") is True
    assert uzbek_search_match("Elektr hisoblagich", "электр") is True
    # Non-matching
    assert uzbek_search_match("Toshkent shahri", "samarkand") is False

def test_get_search_variants():
    variants = get_search_variants("urganch")
    assert "urganch" in variants
    assert "урганч" in variants
