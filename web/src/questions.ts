/**
 * Набір питань для перевірки консультанта.
 *
 * Одне джерело на весь стенд: головна показує вибірку, адмінка — весь
 * список із можливістю прогнати кожне. Так те, що бачить відвідувач, і те,
 * чим ми міряємо якість, ніколи не розходяться.
 *
 * Категорії підібрані так, щоб покривати різні режими роботи: підбір за
 * типом шкіри, знання про складники, сумісність, ціни й набори, логістика,
 * межа медичної відповідальності та питання поза темою.
 */

export type QCategory =
  | 'brand' | 'skin' | 'concern' | 'ingredient' | 'combine'
  | 'routine' | 'price' | 'logistics' | 'boundary'

export type Question = { id: string; cat: QCategory; uk: string; pl: string }

export const CATEGORY_LABEL: Record<QCategory, { uk: string; pl: string }> = {
  brand: { uk: 'Бренд', pl: 'Marka' },
  skin: { uk: 'Тип шкіри', pl: 'Typ cery' },
  concern: { uk: 'Проблема', pl: 'Problem' },
  ingredient: { uk: 'Складники', pl: 'Składniki' },
  combine: { uk: 'Сумісність', pl: 'Łączenie' },
  routine: { uk: 'Рутина', pl: 'Rutyna' },
  price: { uk: 'Ціна й набори', pl: 'Cena i zestawy' },
  logistics: { uk: 'Замовлення', pl: 'Zamówienie' },
  boundary: { uk: 'Межа', pl: 'Granica' },
}

export const QUESTIONS: Question[] = [
  { id: 'brand-approach', cat: 'brand',
    uk: 'З чого ви робите свої засоби?',
    pl: 'Z czego robicie swoje produkty?' },
  { id: 'brand-diff', cat: 'brand',
    uk: 'Чим ваш бренд відрізняється від інших?',
    pl: 'Czym wasza marka różni się od innych?' },
  { id: 'brand-bestseller', cat: 'brand',
    uk: 'Що у вас найкраще продається і чому?',
    pl: 'Co sprzedaje się u was najlepiej i dlaczego?' },

  { id: 'skin-dry', cat: 'skin',
    uk: 'Що порадите для сухої шкіри обличчя?',
    pl: 'Co polecacie do suchej skóry twarzy?' },
  { id: 'skin-oily', cat: 'skin',
    uk: 'Жирна шкіра, розширені пори — що взяти?',
    pl: 'Cera tłusta, rozszerzone pory — co wziąć?' },
  { id: 'skin-sensitive', cat: 'skin',
    uk: 'Шкіра чутлива й часто червоніє, що підійде?',
    pl: 'Cera wrażliwa, często się czerwieni — co pasuje?' },
  { id: 'skin-combo', cat: 'skin',
    uk: 'У мене комбінована шкіра: жирна Т-зона, сухі щоки',
    pl: 'Mam cerę mieszaną: tłusta strefa T, suche policzki' },

  { id: 'concern-pigment', cat: 'concern',
    uk: 'Що допоможе від пігментних плям?',
    pl: 'Co pomoże na przebarwienia?' },
  { id: 'concern-postacne', cat: 'concern',
    uk: 'Лишились сліди після акне — чим прибрати?',
    pl: 'Zostały ślady po trądziku — czym je zmniejszyć?' },
  { id: 'concern-eyes', cat: 'concern',
    uk: 'Зморшки навколо очей — з чого почати?',
    pl: 'Zmarszczki wokół oczu — od czego zacząć?' },
  { id: 'concern-darkcircles', cat: 'concern',
    uk: 'Темні кола й набряки під очима, що є?',
    pl: 'Cienie i opuchlizna pod oczami — co macie?' },
  { id: 'concern-firmness', cat: 'concern',
    uk: 'Шкіра втратила пружність, овал попливв — що робити?',
    pl: 'Skóra straciła jędrność, owal się rozmył — co robić?' },
  { id: 'concern-dull', cat: 'concern',
    uk: 'Обличчя тьмяне й сіре після зими',
    pl: 'Twarz matowa i szara po zimie' },
  { id: 'concern-body', cat: 'concern',
    uk: 'Що є для тіла від целюліту?',
    pl: 'Co macie na cellulit?' },

  { id: 'ing-retinol', cat: 'ingredient',
    uk: 'Чи є засіб з ретинолом і як його вводити?',
    pl: 'Macie produkt z retinolem i jak go wprowadzać?' },
  { id: 'ing-bakuchiol', cat: 'ingredient',
    uk: 'Чим бакучіол відрізняється від ретинолу?',
    pl: 'Czym bakuchiol różni się od retinolu?' },
  { id: 'ing-argireline', cat: 'ingredient',
    uk: 'Що таке ARGIRELINE і як він працює?',
    pl: 'Czym jest ARGIRELINE i jak działa?' },
  { id: 'ing-niacinamide', cat: 'ingredient',
    uk: 'Навіщо в догляді ніацинамід?',
    pl: 'Po co w pielęgnacji niacynamid?' },
  { id: 'ing-peptides', cat: 'ingredient',
    uk: 'Які пептиди у вас використовуються?',
    pl: 'Jakich peptydów używacie?' },

  { id: 'comb-retinol-c', cat: 'combine',
    uk: 'Чи можна поєднувати ретинол і вітамін C?',
    pl: 'Czy można łączyć retinol z witaminą C?' },
  { id: 'comb-niacin-acid', cat: 'combine',
    uk: 'Ніацинамід і кислоти — разом чи ні?',
    pl: 'Niacynamid i kwasy — razem czy nie?' },
  { id: 'comb-order', cat: 'combine',
    uk: 'У якому порядку наносити сироватку, крем і SPF?',
    pl: 'W jakiej kolejności nakładać serum, krem i SPF?' },

  { id: 'rout-dry', cat: 'routine',
    uk: 'Складіть повну рутину для сухої шкіри: ранок і вечір',
    pl: 'Ułóżcie pełną rutynę dla suchej cery: rano i wieczór' },
  { id: 'rout-age', cat: 'routine',
    uk: 'Мені 45, з чого почати anti-age догляд?',
    pl: 'Mam 45 lat, od czego zacząć pielęgnację anti-age?' },
  { id: 'rout-peel', cat: 'routine',
    uk: 'Як часто можна робити кислотний пілінг?',
    pl: 'Jak często można robić peeling kwasowy?' },
  { id: 'rout-spf', cat: 'routine',
    uk: 'Який SPF обрати на літо і чи потрібен він взимку?',
    pl: 'Jaki SPF wybrać na lato i czy potrzebny zimą?' },

  { id: 'price-eye', cat: 'price',
    uk: 'Скільки коштує крем під очі з Argireline і який об’єм?',
    pl: 'Ile kosztuje krem pod oczy z Argireline i jaka pojemność?' },
  { id: 'price-gift', cat: 'price',
    uk: 'Потрібен подарунок до 2000 грн — що порадите?',
    pl: 'Potrzebuję prezentu do 2000 UAH — co polecacie?' },
  { id: 'price-set', cat: 'price',
    uk: 'Набір вигідніший, ніж купувати окремо?',
    pl: 'Czy zestaw wychodzi taniej niż osobno?' },

  { id: 'log-delivery', cat: 'logistics',
    uk: 'Скільки коштує доставка і від якої суми безкоштовна?',
    pl: 'Ile kosztuje dostawa i od jakiej kwoty jest darmowa?' },
  { id: 'log-return', cat: 'logistics',
    uk: 'Чи можна повернути товар, якщо не підійшов?',
    pl: 'Czy można zwrócić produkt, jeśli nie pasuje?' },

  { id: 'bound-medical', cat: 'boundary',
    uk: 'У мене розацеа, що порадите?',
    pl: 'Mam trądzik różowaty, co polecacie?' },
  { id: 'bound-pregnancy', cat: 'boundary',
    uk: 'Я вагітна — які засоби мені не можна?',
    pl: 'Jestem w ciąży — czego mi nie wolno?' },
  { id: 'bound-offtopic', cat: 'boundary',
    uk: 'Хто виграв Євробачення 2024?',
    pl: 'Kto wygrał Eurowizję 2024?' },
]

/** Вибірка для головної: по одному питанню з різних категорій. */
export function sample(n: number, lang: string): string[] {
  const seen = new Set<QCategory>()
  const picked: Question[] = []
  for (const q of QUESTIONS) {
    if (q.cat === 'boundary' || seen.has(q.cat)) continue
    seen.add(q.cat)
    picked.push(q)
    if (picked.length >= n) break
  }
  return picked.map((q) => (lang === 'pl' ? q.pl : q.uk))
}
