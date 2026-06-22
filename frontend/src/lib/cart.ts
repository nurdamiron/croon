'use client'

export interface CartItem {
  productId: string
  variantId?: string
  variantTitle?: string
  name: string
  slug: string
  price: number
  image: string
  quantity: number
  sku?: string
}

const CART_KEY = 'croon_cart'
const FAVORITES_KEY = 'croon_favorites'

// Unique key per product+variant combination
function cartKey(productId: string, variantId?: string): string {
  return variantId ? `${productId}:${variantId}` : productId
}

function findItem(cart: CartItem[], productId: string, variantId?: string): CartItem | undefined {
  return cart.find(i => cartKey(i.productId, i.variantId) === cartKey(productId, variantId))
}

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  const data = localStorage.getItem(CART_KEY)
  return data ? JSON.parse(data) : []
}

export function saveCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event('cart-updated'))
}

export function addToCart(item: Omit<CartItem, 'quantity'>) {
  const cart = getCart()
  const existing = findItem(cart, item.productId, item.variantId)
  if (existing) {
    existing.quantity += 1
  } else {
    cart.push({ ...item, quantity: 1 })
  }
  saveCart(cart)
}

export function removeFromCart(productId: string, variantId?: string) {
  const key = cartKey(productId, variantId)
  saveCart(getCart().filter(i => cartKey(i.productId, i.variantId) !== key))
}

export function updateQuantity(productId: string, quantity: number, variantId?: string) {
  const cart = getCart()
  const item = findItem(cart, productId, variantId)
  if (item) {
    item.quantity = Math.max(1, quantity)
    saveCart(cart)
  }
}

export function getCartTotal(): number {
  return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0)
}

export function getCartCount(): number {
  return getCart().reduce((sum, item) => sum + item.quantity, 0)
}

export function getItemQuantity(productId: string, variantId?: string): number {
  const item = findItem(getCart(), productId, variantId)
  return item ? item.quantity : 0
}

export function decrementItem(productId: string, variantId?: string) {
  const key = cartKey(productId, variantId)
  const cart = getCart()
  const item = findItem(cart, productId, variantId)
  if (!item) return
  if (item.quantity <= 1) {
    saveCart(cart.filter(i => cartKey(i.productId, i.variantId) !== key))
  } else {
    item.quantity -= 1
    saveCart(cart)
  }
}

// Viewed products
const VIEWED_KEY = 'croon_viewed'
const MAX_VIEWED = 20

export function trackViewed(productId: string) {
  if (typeof window === 'undefined') return
  const viewed: string[] = JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]')
  const filtered = viewed.filter(id => id !== productId)
  filtered.unshift(productId)
  localStorage.setItem(VIEWED_KEY, JSON.stringify(filtered.slice(0, MAX_VIEWED)))
}

export function getViewed(): string[] {
  if (typeof window === 'undefined') return []
  return JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]')
}

export function clearViewed() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(VIEWED_KEY)
}

// Favorites
export function getFavorites(): string[] {
  if (typeof window === 'undefined') return []
  const data = localStorage.getItem(FAVORITES_KEY)
  return data ? JSON.parse(data) : []
}

export function toggleFavorite(productId: string) {
  const favs = getFavorites()
  const idx = favs.indexOf(productId)
  if (idx >= 0) {
    favs.splice(idx, 1)
  } else {
    favs.push(productId)
  }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs))
  window.dispatchEvent(new Event('favorites-updated'))
}

export function isFavorite(productId: string): boolean {
  return getFavorites().includes(productId)
}

// Search query tracking
const SEARCHES_KEY = 'croon_searches'
const MAX_SEARCHES = 20

export function trackSearch(query: string) {
  if (typeof window === 'undefined' || !query.trim()) return
  const searches: string[] = JSON.parse(localStorage.getItem(SEARCHES_KEY) || '[]')
  const trimmed = query.trim()
  if (searches[0] !== trimmed) {
    searches.unshift(trimmed)
    localStorage.setItem(SEARCHES_KEY, JSON.stringify(searches.slice(0, MAX_SEARCHES)))
  }
}

export function getSearches(): string[] {
  if (typeof window === 'undefined') return []
  return JSON.parse(localStorage.getItem(SEARCHES_KEY) || '[]')
}

export function clearSearches() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SEARCHES_KEY)
}

// Traffic source tracking (referrer + UTM)
const SOURCE_KEY = 'croon_source'

export function trackSource() {
  if (typeof window === 'undefined') return
  // Only track on first visit (don't overwrite)
  if (localStorage.getItem(SOURCE_KEY)) return
  const params = new URLSearchParams(window.location.search)
  const source: Record<string, string> = {}
  const ref = document.referrer
  if (ref) {
    try {
      source.referrer = new URL(ref).hostname
    } catch {
      source.referrer = ref
    }
  }
  const utmSource = params.get('utm_source')
  const utmMedium = params.get('utm_medium')
  const utmCampaign = params.get('utm_campaign')
  if (utmSource) source.utmSource = utmSource
  if (utmMedium) source.utmMedium = utmMedium
  if (utmCampaign) source.utmCampaign = utmCampaign
  if (Object.keys(source).length > 0) {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(source))
  }
}

export function getSource(): { referrer?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string } {
  if (typeof window === 'undefined') return {}
  const data = localStorage.getItem(SOURCE_KEY)
  return data ? JSON.parse(data) : {}
}
