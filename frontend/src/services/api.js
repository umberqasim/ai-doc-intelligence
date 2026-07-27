import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthEndpoint = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/register');
    if (error.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const documentsAPI = {
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/documents/upload', formData);
  },
  list: () => api.get('/documents/'),
  delete: (id) => api.delete(`/documents/${id}`),
  get: (id) => api.get(`/documents/${id}`),
  update: (id, data) => api.patch(`/documents/${id}`, data),
};

export const adminAPI = {
  listUsers: () => api.get('/auth/admin/users'),
  changeRole: (userId, role) => api.patch(`/auth/admin/users/${userId}/role?role=${role}`),
  toggleStatus: (userId, isActive) => api.patch(`/auth/admin/users/${userId}/status?is_active=${isActive}`),
  deleteUser: (userId) => api.delete(`/auth/admin/users/${userId}`),
};

export const chatAPI = {
  query: (document_id, question) => api.post('/chat/query', { document_id, question }),
  history: (document_id) => api.get(`/chat/history/${document_id}`),
};

export const aiAPI = {
  summarize: (document_id, summary_type) => api.post('/ai/summarize', { document_id, summary_type }),
  questions: (document_id, question_type) => api.post('/ai/questions', { document_id, question_type }),
  sentiment: (document_id) => api.get(`/ai/sentiment/${document_id}`),
  ner: (document_id) => api.get(`/ai/ner/${document_id}`),
  search: (query, document_id) => api.post('/search/', { query, document_id, top_k: 5 }),
  dashboard: () => api.get('/dashboard/stats'),
  cachedResults: (document_id) => api.get(`/ai/results/${document_id}`), // NAYA: saved AI results fetch karne ke liye
  compare: (documentId1, documentId2) => api.post('/ai/compare', { document_id_1: documentId1, document_id_2: documentId2 }),
  translate: (documentId, targetLanguage) => api.post('/ai/translate', { document_id: documentId, target_language: targetLanguage }),
  exportPdf: (documentId) => api.get(`/ai/export-pdf/${documentId}`, { responseType: 'blob' }),
};

export default api;