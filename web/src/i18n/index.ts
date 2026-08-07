import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import uk from './uk.json'
import pl from './pl.json'

// Дефолт — польська: демонструємо готовність до польського офісу.
// Жодного хардкод-рядка в компонентах, усе через t().
i18n.use(initReactI18next).init({
  resources: { uk: { t: uk }, pl: { t: pl } },
  // Українська за замовчуванням: бренд український, і стенд
  // передусім показують українською. Польська — перемикачем.
  lng: localStorage.getItem('rb-lang') || 'uk',
  fallbackLng: 'uk',
  defaultNS: 't',
  interpolation: { escapeValue: false },
})

export const setLang = (l: 'uk' | 'pl') => {
  localStorage.setItem('rb-lang', l)
  void i18n.changeLanguage(l)
}

export default i18n
