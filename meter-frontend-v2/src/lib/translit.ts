// Lotin/Kirill farqsiz qidiruv uchun normalizatsiya.
// Ham qidiruv so'rovi, ham maydon shu funksiyadan o'tkaziladi — natijada
// "Зарбулок" va "Zarbulok" bir xil ko'rinishga (soddalashtirilgan lotin ASCII)
// keladi va o'zaro mos keladi.

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // O'zbek kirill maxsus harflari
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
}

export function translitNormalize(input: string | null | undefined): string {
  if (!input) return ''
  let s = input.toLowerCase()
  // Apostrof variantlarini olib tashlash (oʻ, gʻ, o‘, o', ...)
  s = s.replace(/[ʻʼ'`‘’´]/g, '')
  // Kirill -> lotin
  let out = ''
  for (const ch of s) out += CYR_TO_LAT[ch] ?? ch
  // Bir nechta lotin digraflarini ham soddalashtirish (kirill map bilan mos bo'lsin)
  // (масалан kirill "х"->"x", lotin "h" ni ham "x" ga keltirmaymiz — faqat oddiy holat)
  return out
}

// Qulaylik uchun: target matnida query bormi (translit-farqsiz)
export function translitIncludes(haystack: string | null | undefined, query: string): boolean {
  return translitNormalize(haystack).includes(translitNormalize(query))
}
