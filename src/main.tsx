import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/app.css";
import "./styles/editor.css";
import "./styles/markdown.css";
import "./styles/graph.css";
import "./styles/special.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
