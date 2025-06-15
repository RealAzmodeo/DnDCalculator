import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeDataService } from './src/services/dataService'; // Import the new service initializer
import 'uuid'; // Ensure uuid is available, though direct import in component is better

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

async function main() {
  try {
    await initializeDataService(); // Initialize data service (loads master_index.json)
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Failed to initialize application:", error);
    rootElement.innerHTML = '<div style="color: red; padding: 20px;">Failed to load application data. Please check the console and ensure `database/master_index.json` is present and correct.</div>';
  }
}

main();
