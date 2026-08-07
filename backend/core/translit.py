"""
core/translit.py — O'zbek lotin va kirill alifbolari o'rtasida moslashuvchan qidiruv (Script-agnostic search)

Lotin harflari kiritilganda ham kirill matnlarni topadi, kirill kiritilganda ham lotin matnlarni topadi.
Apostroflar (' , ’ , ʻ , ‘ , `) va maxsus harflar (ў->o, қ->q, ғ->g, ҳ->h) avtomatik soddalashtiriladi.
"""

CYR_TO_LAT: dict[str, str] = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh',
    'щ': 'sh', 'ъ': '', 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'ў': "o'", 'қ': 'q', 'ғ': "g'", 'ҳ': 'h',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'J', 'З': 'Z',
    'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R',
    'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'X', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh',
    'Щ': 'Sh', 'Ъ': '', 'Ы': 'I', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya', 'Ў': "O'", 'Қ': 'Q',
    'Ғ': "G'", 'Ҳ': 'H',
}

LAT_TO_CYR: dict[str, str] = {
    'yo': 'ё', 'ch': 'ч', 'sh': 'ш', 'yu': 'ю', 'ya': 'я', "o'": 'ў', "g'": 'ғ',
    'Yo': 'Ё', 'Ch': 'Ч', 'Sh': 'Ш', 'Yu': 'Ю', 'Ya': 'Я', "O'": 'Ў', "G'": 'Ғ',
    'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е', 'j': 'ж', 'z': 'з',
    'i': 'и', 'y': 'й', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п',
    'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'f': 'ф', 'x': 'х', 'q': 'қ', 'h': 'ҳ',
    'A': 'А', 'B': 'Б', 'V': 'В', 'G': 'Г', 'D': 'Д', 'E': 'Е', 'J': 'Ж', 'Z': 'З',
    'I': 'И', 'Y': 'Й', 'K': 'К', 'L': 'Л', 'M': 'М', 'N': 'Н', 'O': 'О', 'P': 'П',
    'R': 'Р', 'S': 'С', 'T': 'Т', 'U': 'У', 'F': 'Ф', 'X': 'Х', 'Q': 'Қ', 'H': 'Ҳ',
}

def cyrillic_to_latin(text: str) -> str:
    if not text:
        return ""
    out = []
    for ch in text:
        out.append(CYR_TO_LAT.get(ch, ch))
    return "".join(out)

def latin_to_cyrillic(text: str) -> str:
    if not text:
        return ""
    s = text
    # digraph replacements first
    for k, v in [("yo", "ё"), ("ch", "ч"), ("sh", "ш"), ("yu", "ю"), ("ya", "я"),
                ("Yo", "Ё"), ("Ch", "Ч"), ("Sh", "Ш"), ("Yu", "Ю"), ("Ya", "Я"),
                ("o'", "ў"), ("g'", "ғ"), ("O'", "Ў"), ("G'", "Ғ"),
                ("o’", "ў"), ("g’", "ғ"), ("O’", "Ў"), ("G’", "Ғ"),
                ("oʻ", "ў"), ("gʻ", "ғ"), ("Oʻ", "Ў"), ("Gʻ", "Ғ")]:
        s = s.replace(k, v)
    out = []
    for ch in s:
        out.append(LAT_TO_CYR.get(ch, ch))
    return "".join(out)

def normalize_uzbek(text: str | None) -> str:
    """Matnni soddalashtirilgan standart lotin-ASCII formatiga o'tkazadi."""
    if not text:
        return ""
    s = str(text).lower()
    # Apostrof variantlarini olib tashlaymiz
    for ch in ("'", "’", "ʻ", "‘", "`", "´", "′"):
        s = s.replace(ch, "")
    out = [CYR_TO_LAT.get(ch, ch).replace("'", "") for ch in s]
    return "".join(out)

def uzbek_search_match(haystack: str | None, query: str | None) -> bool:
    """Lotin/Kirill farqsiz matn ichida qidiruv iborasi bor-yo'qligini tekshiradi."""
    if not query or not query.strip():
        return True
    if not haystack:
        return False
    return normalize_uzbek(query).strip() in normalize_uzbek(haystack)

def get_search_variants(query: str) -> list[str]:
    """Qidiruv iborasining ham lotin, ham kirill ko'rinishlarini qaytaradi."""
    if not query or not query.strip():
        return []
    q = query.strip()
    variants = {q, cyrillic_to_latin(q), latin_to_cyrillic(q), normalize_uzbek(q)}
    return [v for v in variants if v]
