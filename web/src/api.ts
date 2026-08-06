const BASE = import.meta.env.VITE_API_BASE ?? ''

// Демо за basic auth: креденшали живуть у sessionStorage, без кук і JWT.
export function setAdminCreds(user: string, pass: string) {
  sessionStorage.setItem('rb-admin', btoa(`${user}:${pass}`))
}
export const hasAdminCreds = () => Boolean(sessionStorage.getItem('rb-admin'))

export const clearAdminCreds = () => sessionStorage.removeItem('rb-admin')

/** Подія «сесія протухла» — оболонка адмінки повертає екран входу. */
export const AUTH_FAILED = 'rb-auth-failed'

async function request<T>(path: string, init: RequestInit = {}, admin = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (admin) {
    const creds = sessionStorage.getItem('rb-admin')
    if (creds) headers.Authorization = `Basic ${creds}`
  }
  const r = await fetch(`${BASE}${path}`, { ...init, headers })
  if (r.status === 401 && admin) {
    // Невірний пароль не має лишати інтерфейс у вічному «Завантаження…»:
    // чистимо сесію й просимо увійти знову.
    clearAdminCreds()
    window.dispatchEvent(new CustomEvent(AUTH_FAILED))
    throw new Error('401')
  }
  if (!r.ok) throw new Error(String(r.status))
  return r.json() as Promise<T>
}

export const api = {
  chat: (body: { text: string; conversation_id?: number | null; lang?: string }) =>
    request<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify(body) }),
  escalate: (body: { conversation_id: number; phone?: string }) =>
    request<{ ok: boolean }>('/api/chat/escalate', { method: 'POST', body: JSON.stringify(body) }),
  admin: {
    get: <T,>(path: string) => request<T>(path, {}, true),
    post: <T,>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }, true),
  },
}

export type Source = { type: string; title: string; url: string | null }

export type ProductCard = {
  sku: string
  title: string
  price: number
  old_price: number | null
  volume: string | null
  variant_label: string | null
  image: string | null
  url: string | null
  ingredients: string[]
}

export type ChatResponse = {
  conversation_id: number
  lang: 'uk' | 'pl'
  reply: string
  escalate?: boolean
  offer_human?: boolean
  reason?: string
  confidence?: number
  sources: Source[]
  products: ProductCard[]
}
