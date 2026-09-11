import type { Metadata } from "next";
import Link from "next/link";
import { AudioLines } from "lucide-react";
import "./globals.css";
import "./recorder.css";
import "./processing.css";
import "./minute.css";

export const metadata: Metadata = {
  title: "Minutas — Cada reunión, un paso adelante",
  description:
    "Grabá tus reuniones y transformá las conversaciones en minutas claras, editables y listas para compartir.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <a className="skip-link" href="#content">
          Saltar al contenido
        </a>
        <header className="site-header">
          <div className="header-inner">
            <Link href="/" className="brand" aria-label="Minutas, inicio">
              <span className="brand-icon">
                <AudioLines size={23} />
              </span>
              minutas<span className="brand-dot">.</span>
            </Link>
            <nav aria-label="Navegación principal">
              <Link href="/">Reuniones</Link>
              <Link className="nav-create" href="/reuniones/nueva">
                Nueva reunión <span>＋</span>
              </Link>
            </nav>
            
          </div>
        </header>
        <div id="content">{children}</div>
        <footer className="site-footer">
          <span>
            minutas<span className="accent">.</span>
          </span>
          <p>By Lautaro Tomasetig</p>
          <small>Conversaciones que se convierten en próximos pasos.</small>
        </footer>
      </body>
    </html>
  );
}
