const localApiBase = import.meta.env.VITE_API_BASE || 'http://localhost:5010'
const apiClientVersion = 'same-origin-api-v3'

export const resolveApiUrl = (url: string) => {
  if (!url.startsWith('/api')) return false
  if (typeof window === 'undefined') return false
  if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) return false
  return `${localApiBase}${url}`
}

const isLocalApiRequest = (url: string) => {
  return Boolean(resolveApiUrl(url))
}

const shouldUseLocalFallback = (url: string, response: Response, payload: unknown) => {
  if (!isLocalApiRequest(url)) return false
  return response.status === 404 && payload === null
}

const request = async (url: string, options: RequestInit = {}) => {
  return fetch(url, {
    credentials: url.startsWith('http') ? 'include' : 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  void apiClientVersion
  const requestUrl = resolveApiUrl(url) || url
  let response: Response
  try {
    response = await request(requestUrl, options)
  } catch {
    if (isLocalApiRequest(url) && requestUrl !== url) {
      try {
        response = await request(url, options)
      } catch {
        throw new Error('无法连接到后端服务，请确认服务已启动后刷新页面')
      }
    } else {
      throw new Error('无法连接到后端服务，请确认服务已启动后刷新页面')
    }
  }

  const contentType = response.headers.get('content-type') || ''
  let payload = contentType.includes('application/json') ? await response.json() : null

  if (shouldUseLocalFallback(url, response, payload)) {
    try {
      response = await request(`${localApiBase}${url}`, options)
    } catch {
      throw new Error('无法连接到后端服务，请确认服务已启动后刷新页面')
    }
    const fallbackContentType = response.headers.get('content-type') || ''
    payload = fallbackContentType.includes('application/json') ? await response.json() : null
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `请求失败：${response.status}`)
  }

  return payload as T
}
