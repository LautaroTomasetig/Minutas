import Link from "next/link";
import {
  ArrowUpRight,
  Mic,
  FileText,
  PencilLine,
  ArrowRight,
  AudioLines,
  Check,
} from "lucide-react";

export default function Home() {
  return (
    <main className="container home">
      <div className="home-intro">
        
         
        <p className="eyebrow welcome">TU ESPACIO DE REUNIONES</p>
        <h1>
          Buenas conversaciones.
          <br />
          <span className="serif">Próximos pasos claros.</span>
        </h1>
        <p className="hero-description">
      Grabá tu reunión y transformala
          <br className="desktop-break" /> en una minuta que tu equipo pueda
          poner en acción.
        </p>
      </div>
      <div className="home-grid">
        <Link href="/reuniones/nueva" className="start-card">
          <div className="start-top">
            <span className="large-icon">
              <Mic size={26} />
            </span>
            <ArrowUpRight size={25} />
          </div>
          <div>
            <p className="eyebrow">EMPEZÁ POR UNA CONVERSACIÓN</p>
            <h2>Grabá tu reunión</h2>
            <p>
              Un título, tu micrófono y las ideas de tu equipo.
              <br />
              Nos ocupamos de ordenar lo importante.
            </p>
          </div>
          <span className="start-link">
            Crear una reunión <ArrowRight size={19} />
          </span>
        </Link>
        <div className="preview-card">
          <div className="preview-top">
            <span className="tiny-label">DE TUS IDEAS A UN DOCUMENTO</span>
            <FileText size={18} />
          </div>
          <div className="paper-preview" aria-hidden="true">
            <div className="paper-brand">
              <AudioLines size={16} />
              minutas.
            </div>
            <div className="paper-line short" />
            <div className="paper-rule" />
            <div className="paper-line medium" />
            <div className="paper-line" />
            <div className="paper-line" />
            <div className="paper-topic">
              <span>01</span>
              <div>
                <div className="paper-line medium" />
                <div className="paper-line" />
              </div>
              <Check size={14} />
            </div>
            <div className="paper-topic">
              <span>02</span>
              <div>
                <div className="paper-line short" />
                <div className="paper-line" />
              </div>
            </div>
          </div>
          <p>
            Lo que se habló. Lo que se decidió.
            <br />
            <strong>Lo que sigue.</strong>
          </p>
        </div>
      </div>
      <section className="how-section" aria-labelledby="how-title">
        <div className="how-heading">
          <p className="eyebrow">SIMPLE, DE PRINCIPIO A FIN</p>
          <h2 id="how-title">Dejá que la conversación fluya.</h2>
        </div>
        <div className="how-grid">
          {[
            {
              icon: Mic,
              n: "01",
              title: "Grabá",
              text: "Iniciá, pausá y retomá. La reunión se graba directamente desde tu navegador.",
            },
            {
              icon: FileText,
              n: "02",
              title: "Transformá",
              text: "La IA organiza los temas, las decisiones y las tareas en una minuta estructurada.",
            },
            {
              icon: PencilLine,
              n: "03",
              title: "Editá",
              text: "Revisá cada punto, ajustá los detalles y exportá un PDF listo para tu equipo.",
            },
          ].map(({ icon: Icon, n, title, text }) => (
            <article key={n}>
              <div className="how-icon">
                <Icon size={21} />
                <span>{n}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
