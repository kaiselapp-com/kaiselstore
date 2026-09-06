import React from "react";
import { StoreProvider, ToastHost, useRoute, navigate } from "./state/store";
import { Navbar, Footer } from "./components/layout";
import { EmptyState } from "./components/ui";
import Home from "./pages/Home";
import Gallery, { CategoriesPage } from "./pages/Gallery";
import AppDetail from "./pages/AppDetail";
import DeveloperPage from "./pages/Developer";
import { DownloadsPage, UpdatesPage } from "./pages/DownloadsUpdates";
import DevDashboard from "./pages/DevDashboard";
import Admin from "./pages/Admin";
import ApiDocs from "./pages/ApiDocs";
import AuthPage from "./pages/AuthPage";
import DeviceLab from "./pages/DeviceLab";

function Router() {
  const route = useRoute();
  const [head, param] = route.parts;

  switch (head) {
    case undefined: return <Home />;
    case "apps": return <Gallery />;
    case "categories": return <CategoriesPage />;
    case "app": return param ? <AppDetail packageName={param} /> : <Gallery />;
    case "developer": return param ? <DeveloperPage slug={param} /> : <Home />;
    case "downloads": return <DownloadsPage />;
    case "updates": return <UpdatesPage />;
    case "dev": return <DevDashboard />;
    case "device": return <DeviceLab />;
    case "admin": return <Admin />;
    case "api-docs": return <ApiDocs />;
    case "auth":
    case "account": return <AuthPage />;
    default:
      return (
        <div className="max-w-2xl mx-auto px-4 pt-20">
          <EmptyState icon="alert" title="404 — route not found"
            sub={`Nothing lives at "${route.path}". The store, however, very much does.`}
            action={<button onClick={() => navigate("/")} className="btn-primary px-5 py-2 text-[13px] cursor-pointer">Back to Kaisel Store</button>} />
        </div>
      );
  }
}

export default function App() {
  return (
    <StoreProvider>
      <div className="kaisel-ambient" aria-hidden="true" />
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pb-4">
          <Router />
        </main>
        <Footer />
      </div>
      <ToastHost />
    </StoreProvider>
  );
}
