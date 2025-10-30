// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { bootstrapReady } from "./bootstrap";
import "./index.css";
import App from "./App";
import { ToastProvider } from "./components/ui/Toast";
import { getInitialTheme, applyTheme } from "./lib/theme";

// Apply theme before React renders (avoid FOUC)
applyTheme(getInitialTheme());

const queryClient = new QueryClient();

async function start() {
  // Wait for DB + MSW to be ready so first /api/* calls succeed
  await bootstrapReady;

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

start();
