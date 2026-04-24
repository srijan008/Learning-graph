import axios from 'axios';

const API = 'http://127.0.0.1:8002/api/v1';
const CURRICULUM_CACHE_KEY = 'curriculum_cache_v3';

export async function fetchCurriculum(goal?: string) {
  const finalGoal = goal || localStorage.getItem('selected_goal') || 'neet';
  
  // 1. Check localStorage first
  const cached = localStorage.getItem(CURRICULUM_CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      // Optional: check if it's the right curriculum or if it's stale
      // For now, we'll return it immediately but still fetch in background to refresh
      fetchInBackground(finalGoal); 
      return parsed;
    } catch (e) {
      console.error("Cache parse error", e);
    }
  }

  // 2. Fetch from API if not cached
  return await fetchInBackground(finalGoal);
}

async function fetchInBackground(goal: string) {
  try {
    const r = await axios.get(`${API}/graph/curriculum?curriculum=${goal}`);
    const data = r.data || [];
    localStorage.setItem(CURRICULUM_CACHE_KEY, JSON.stringify(data));
    return data;
  } catch (e) {
    console.error("Curriculum fetch error", e);
    return [];
  }
}
