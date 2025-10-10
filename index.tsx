import { initializeEventListeners } from './src/events';
import { loadShortcuts, populateShortcutsPanel } from './src/shortcuts';

/**
 * Main application entry point.
 * Initializes the application after the DOM is fully loaded.
 */
window.addEventListener('DOMContentLoaded', () => {
    // Load any saved user preferences
    loadShortcuts();

    // Set up the UI based on loaded data
    populateShortcutsPanel();

    // Wire up all the interactive parts of the application
    initializeEventListeners();
});