export const collapsedProjectsKey = "luma.sidebar.collapsedProjects.v1";
export const sidebarPreferencesCleared = "luma:sidebar-preferences-cleared";

export function clearSidebarPreferences() {
  try {
    localStorage.removeItem(collapsedProjectsKey);
  } catch {
    /* Storage can be unavailable. */
  }
  window.dispatchEvent(new Event(sidebarPreferencesCleared));
}
