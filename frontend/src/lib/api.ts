import { toast } from "sonner";

// Base API URL
export const API_BASE_URL = "http://localhost:8080/api";

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

    // Handle Auth Error
    if (response.status === 401) {
      // toast.error("Session expired. Please sign in again.");
      // Optional: Clear token
      // localStorage.removeItem("auth_token");
      // Optional: Redirect
      // window.location.href = "/login";
      // Ensure we don't spam toasts or redirects, usually handled by AuthContext or MainLayout
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
        } catch {
            // Ignore JSON parse error for non-JSON error responses
        }
        throw new Error(errorMessage);
    }

    // Return empty for 204 or empty content
    if (response.status === 204) return {} as T;

    try {
        return await response.json();
    } catch {
        // Return null/empty if response is not JSON (e.g. export download)
        // But for exports we usually handle Blob separately. 
        // This helper assumes JSON by default.
        return {} as T;
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
  download: async (endpoint: string, filename?: string) => {
    const token = localStorage.getItem("auth_token");
    const headers: HeadersInit = {};
    if (token) {
      (headers as any)["Authorization"] = `Bearer ${token}`;
    }
     const url = endpoint.startsWith("http") 
    ? endpoint 
    : `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error("Download failed");

        const blob = await response.blob();
        
        // Try to guess filename if not provided
        let finalFilename = filename || "download";
        if (!filename) {
             const disposition = response.headers.get('Content-Disposition');
             if (disposition && disposition.indexOf('attachment') !== -1) {
                 const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                 const matches = filenameRegex.exec(disposition);
                 if (matches != null && matches[1]) { 
                    finalFilename = matches[1].replace(/['"]/g, '');
                    try { finalFilename = decodeURIComponent(finalFilename); } catch(e){}
                 }
             }
        }

        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        
        return true;
    } catch (error) {
        console.error("Download Error:", error);
        throw error;
    }
  }
};
