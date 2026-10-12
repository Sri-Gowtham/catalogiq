export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function describe(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => (typeof d?.msg === 'string' ? d.msg.replace(/^Value error, /, '') : JSON.stringify(d))).join('; ')
  }
  return fallback
}

/** Called when the API rejects the session, so the app can return to the login page. */
let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

// A 401 from these means "wrong details", not "your session ended".
const AUTH_PATHS = ['/auth/login', '/auth/signup', '/auth/demo', '/auth/forgot', '/auth/reset', '/auth/logout']

/**
 * The session lives in an httpOnly cookie that the browser sends by itself, so page scripts never hold a token.
 * The custom header proves a write came from this app: other sites cannot add it without a CORS preflight.
 */
export async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('X-Requested-With', 'catalogiq')
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'Cannot reach the CatalogIQ API. Is the backend running on port 8000?')
  }
  if (!res.ok) {
    let detail: unknown = res.statusText
    try {
      detail = (await res.json()).detail
    } catch {
      // body was not JSON; keep the status text
    }
    if (res.status === 401 && !AUTH_PATHS.includes(path)) onUnauthorized()
    throw new ApiError(res.status, describe(detail, res.statusText))
  }
  return res
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await raw(path, init)).json() as Promise<T>
}

export const get = <T>(path: string) => request<T>(path)
export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) })
export const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const del = <T>(path: string) => request<T>(path, { method: 'DELETE' })
