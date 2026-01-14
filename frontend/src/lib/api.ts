
// Base API URL
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

type RequestOptions = RequestInit & {
  // Allow passing parameters that are not part of RequestInit if needed in future
};

/**
 * Enhanced fetch client that automatically handles:
 * 1. Authorization headers (Bearer token)
 * 2. JSON parsing
 * 3. Error handling with Toasts
 * 4. Auth redirects on 401
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = localStorage.getItem("auth_token");

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    (headers as any)["Authorization"] = `Bearer ${token}`;
  }

  // Handle FormData separately (don't set Content-Type)
  if (options.body instanceof FormData) {
    delete (headers as any)["Content-Type"];
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle errors
    if (!response.ok) {
      // Try to extract error message from response body
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Ignore JSON parse error for non-JSON error responses
      }

      // Special handling for 401 Unauthorized
      if (response.status === 401) {
        // On login/register pages, just throw the error (show message to user)
        // On other pages, clear token and redirect
        const isAuthPage = window.location.pathname.includes("/login");

        if (!isAuthPage) {
          // Clear invalid token
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_user");
          window.location.href = "/login";
        }

        // Throw with the actual backend error message
        throw new Error(errorMessage);
      }

      throw new Error(errorMessage);
    }

    // Return empty for 204 or empty content
    if (response.status === 204) return {} as T;

    try {
      const result = await response.json();

      // Unwrap standard response format {code, message, data, error}
      if (result && typeof result === 'object' && 'code' in result) {
        if (result.code === 200) {
          // Success: return user data
          return result.data as T;
        } else {
          // Business Logic Error (handled by backend util)
          throw new Error(result.error || result.message || "Operation failed");
        }
      }

      // Fallback for non-standard responses (should be rare now)
      return result as T;
    } catch (err: any) {
      // Rethrow logic error from above
      throw err;
    }

  } catch (error: any) {
    // We can log or toast here
    console.error("API Request Failed:", error);
    // Rethrow so components can handle specific states (loading/error UI)
    throw error;
  }
}

// Convenience methods
export const api = {
  get: <T>(url: string, options?: RequestOptions) => apiRequest<T>(url, { ...options, method: 'GET' }),
  post: <T>(url: string, body?: any, options?: RequestOptions) => apiRequest<T>(url, {
    ...options,
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  put: <T>(url: string, body?: any, options?: RequestOptions) => apiRequest<T>(url, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body)
  }),
  patch: <T>(url: string, body?: any, options?: RequestOptions) => apiRequest<T>(url, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(body)
  }),
  delete: <T>(url: string, options?: RequestOptions) => apiRequest<T>(url, { ...options, method: 'DELETE' }),

  /**
   * Check if a file already exists by its hash (Instant Upload)
   */
  checkHash: (hash: string) => api.post<{ exists: boolean; batch_id?: number; status?: string }>("/upload/check", { hash }),

  /**
   * Special method for file uploads with progress tracking
   * Uses XMLHttpRequest because Fetch API doesn't support upload progress
   */
  upload: <T>(url: string, file: File, onProgress: (percent: number) => void, metadata?: { hash: string }): Promise<T> => {
    console.log(`[API] Starting upload to: ${url}`, file.name);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const targetUrl = url.startsWith("http")
        ? url
        : `${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;

      xhr.open("POST", targetUrl);

      // Auth header
      const token = localStorage.getItem("auth_token");
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      // Progress listener
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            if (result && typeof result === 'object' && 'code' in result) {
              if (result.code === 200) {
                resolve(result.data as T);
              } else {
                reject(new Error(result.error || result.message || "Upload failed"));
              }
            } else {
              resolve(result as T);
            }
          } catch (e) {
            resolve(xhr.responseText as any);
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.error || `HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error("Network error"));

      const formData = new FormData();
      if (metadata?.hash) {
        formData.append("hash", metadata.hash);
      }
      formData.append("file", file);
      xhr.send(formData);
    });
  },

  download: async (endpoint: string, _filename?: string) => {
    // New Strategy: Use One-time Download Token
    // This allows the browser to handle the download natively (streams to disk, no memory issues)
    // and correctly respects Content-Disposition filename from backend.

    try {
      // 1. Get short-lived token
      const { token } = await api.get<{ token: string }>("/auth/download-token");

      // 2. Construct URL with token
      const baseUrl = endpoint.startsWith("http")
        ? endpoint
        : `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

      const separator = baseUrl.includes("?") ? "&" : "?";
      const downloadUrl = `${baseUrl}${separator}token=${token}`;

      // 3. Trigger native download
      // Creating an hidden iframe or link is cleaner than window.location for UX (doesn't replace history)
      // But for file downloads, window.location is usually fine as it doesn't navigate away if it's an attachment.
      // Let's use a temp link click to be safe.
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      return true;
    } catch (error) {
      console.error("Download Init Failed:", error);
      throw error;
    }
  },

  // 5. 获取进度 SSE 连接
  getProgressSource(batchId: string): EventSource {
    const token = localStorage.getItem("auth_token");
    return new EventSource(`${API_BASE_URL}/batches/${batchId}/progress?token=${token}`);
  },

  pauseBatch: (id: string | number) => api.post(`/batches/${id}/pause`),
  resumeBatch: (id: string | number) => api.post(`/batches/${id}/resume`),
  cancelBatch: (id: string | number) => api.post(`/batches/${id}/cancel`),
};
