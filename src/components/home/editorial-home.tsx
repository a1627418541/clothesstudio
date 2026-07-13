import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Footprints,
  LockKeyhole,
  Palette,
  ScanFace,
  Shirt,
} from "lucide-react";
import { EditorialLabel } from "@/components/ui/editorial-label";
import { SiteHeader } from "@/components/ui/site-header";

const steps = [
  ["01", "Upload", "Front, profile, and full-length photographs in natural light."],
  ["02", "Profile", "A few practical details shape proportion and styling context."],
  ["03", "Report", "Receive directions, colors, and practical wardrobe advice."],
] as const;

const proofPoints = [
  [LockKeyhole, "Private by design", "Anonymous sessions are available; no account is required."],
  [ScanFace, "Durable reports", "Generated preview assets are stored for reliable report viewing."],
  [Check, "Actionable output", "Recommendations include clothing, hair, shoes, colors, and avoid notes."],
] as const;

const faqs = [
  ["Do I need an account?", "No. You can begin with an anonymous browser session and return to the report from that session."],
  ["Which photographs work best?", "Use one front portrait, one side profile, and one full-length photograph in even natural light."],
  ["What is included?", "A primary direction, two alternatives, clothing, hair and shoe guidance, colors, and avoid notes."],
] as const;

const sampleColors = ["#17233a", "#f4f0e8", "#b9b5ad", "#b38b63", "#687057"];

function ColorSwatches() {
  return (
    <div className="flex gap-2" aria-label="Sample color direction">
      {sampleColors.map((color) => (
        <span
          key={color}
          className="h-7 w-7 border border-black/10"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function HeroReportPreview() {
  return (
    <div className="relative ml-auto max-w-[460px] border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[0_24px_70px_rgba(50,39,29,0.12)]">
      <div className="absolute -right-5 -top-5 h-full w-full border border-[var(--line)]" aria-hidden="true" />
      <div className="relative">
        <div className="flex justify-between border-b border-[var(--line)] pb-6">
          <EditorialLabel>Report / 01</EditorialLabel>
          <span className="text-[0.62rem] uppercase tracking-[0.2em] text-[var(--muted-ink)]">Personal edition</span>
        </div>
        <div className="py-8">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[var(--oxblood)]">Primary direction</p>
          <h2 className="font-editorial text-5xl font-medium leading-[0.9]">Clean<br />Casual</h2>
          <p className="mt-4 text-sm italic text-[var(--muted-ink)]">Modern Minimalist · Everyday refinement</p>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-5 border-y border-[var(--line)] py-5 text-sm">
          <span className="uppercase tracking-[0.12em] text-[var(--muted-ink)]">Key look</span>
          <p className="leading-6">Precise layers, relaxed tailoring, and quiet material contrast.</p>
        </div>
        <div className="mt-6 flex items-end justify-between">
          <div>
            <p className="mb-3 text-[0.62rem] uppercase tracking-[0.18em] text-[var(--muted-ink)]">Color direction</p>
            <ColorSwatches />
          </div>
          <span className="font-editorial text-4xl text-[var(--oxblood)]">01</span>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="border-b border-[var(--line)]">
      <div className="editorial-shell grid min-h-[720px] grid-cols-12 items-center gap-10 py-20">
        <div className="col-span-7 pr-8">
          <EditorialLabel>Personal style diagnosis</EditorialLabel>
          <h1
            aria-label="A personal style report, edited for you."
            className="mt-8 max-w-[760px] font-editorial text-[clamp(4.8rem,7.6vw,7.6rem)] font-medium leading-[0.82] tracking-[-0.045em]"
          >
            A personal style report,
            <span className="block italic text-[var(--oxblood)]">edited for you.</span>
          </h1>
          <p className="mt-9 max-w-xl text-lg leading-8 text-[var(--muted-ink)]">
            Three photographs. One considered direction. Practical wardrobe, color, hair, and shoe guidance shaped around your profile.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <Link href="/diagnosis" className="editorial-button px-7">Begin your diagnosis <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link href="#process" className="editorial-button-secondary px-7">See the process</Link>
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">No account required · Three photographs · A complete report</p>
        </div>
        <div className="col-span-5"><HeroReportPreview /></div>
      </div>
    </section>
  );
}

function Process() {
  return (
    <section id="process" className="border-b border-[var(--line)] py-24">
      <div className="editorial-shell grid grid-cols-12 gap-8">
        <div className="col-span-4">
          <EditorialLabel>The process</EditorialLabel>
          <h2 className="mt-5 font-editorial text-5xl font-medium leading-none">Three photographs.<br />One considered direction.</h2>
        </div>
        <ol className="col-span-8 grid grid-cols-3 border-l border-[var(--line)]">
          {steps.map(([number, title, description]) => (
            <li key={number} className="flex min-h-[300px] flex-col border-r border-[var(--line)] px-8 py-4 last:border-r-0">
              <span className="font-editorial text-5xl text-[var(--oxblood)]">{number}</span>
              <h3 className="mt-auto font-editorial text-3xl font-medium">{title}</h3>
              <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function SampleReport() {
  const advice = [
    [Shirt, "Clothing", "Precise shirts, tapered trousers, and one softly structured layer."],
    [Footprints, "Shoes", "Minimal leather sneakers or slim loafers keep the finish quiet."],
  ] as const;
  return (
    <section className="bg-[var(--ink)] py-24 text-[var(--paper)]">
      <div className="editorial-shell grid grid-cols-12 gap-12">
        <div className="col-span-4">
          <EditorialLabel tone="inverse">Inside the report</EditorialLabel>
          <h2 className="mt-6 font-editorial text-6xl font-medium leading-[0.92]">Direction,<br />not noise.</h2>
          <p className="mt-7 max-w-sm leading-7 text-[#c9c0b5]">A scannable editorial report that turns analysis into specific, wearable decisions.</p>
        </div>
        <article className="col-span-8 bg-[var(--surface)] p-10 text-[var(--ink)]">
          <div className="flex justify-between border-b border-[var(--line)] pb-7">
            <div><p className="text-xs uppercase tracking-[0.18em] text-[var(--oxblood)]">Primary style direction</p><h3 className="mt-3 font-editorial text-5xl font-medium">Clean Casual</h3></div>
            <div className="text-right text-xs uppercase leading-6 tracking-[0.12em] text-[var(--muted-ink)]"><p>Modern Minimalist</p><p>Rules match 87%</p></div>
          </div>
          <p className="max-w-3xl py-7 text-lg leading-8 text-[var(--muted-ink)]">A relaxed but polished everyday direction built around clear lines, breathable fabrics, and controlled contrast.</p>
          <div className="grid grid-cols-2 border-y border-[var(--line)]">
            {advice.map(([Icon, label, copy]) => (
              <div key={label} className="border-r border-[var(--line)] p-6 first:pl-0 last:border-r-0 last:pr-0">
                <div className="flex items-center gap-3 text-[var(--oxblood)]"><Icon className="h-4 w-4" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-[0.14em]">{label}</span></div>
                <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">{copy}</p>
              </div>
            ))}
          </div>
          <div className="mt-7 grid grid-cols-2 gap-10">
            <div><div className="mb-4 flex items-center gap-3"><Palette className="h-4 w-4 text-[var(--oxblood)]" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Color palette</span></div><ColorSwatches /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em]">Avoid</p><p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">Excessive logos, neon accents, and uncontrolled volume.</p></div>
          </div>
        </article>
      </div>
    </section>
  );
}

function ProofAndFAQ() {
  return (
    <>
      <section className="border-b border-[var(--line)] py-24">
        <div className="editorial-shell">
          <EditorialLabel>Designed with restraint</EditorialLabel>
          <div className="mt-9 grid grid-cols-3 border-y border-[var(--line)]">
            {proofPoints.map(([Icon, title, description]) => (
              <article key={title} className="min-h-[230px] border-r border-[var(--line)] p-8 first:pl-0 last:border-r-0 last:pr-0">
                <Icon className="h-5 w-5 text-[var(--oxblood)]" aria-hidden="true" />
                <h3 className="mt-12 font-editorial text-3xl font-medium">{title}</h3>
                <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="py-24">
        <div className="editorial-shell grid grid-cols-12 gap-12">
          <div className="col-span-4"><EditorialLabel>Questions</EditorialLabel><h2 className="mt-6 font-editorial text-5xl font-medium">Before you begin.</h2></div>
          <div className="col-span-8 border-t border-[var(--line)]">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group border-b border-[var(--line)]">
                <summary className="flex cursor-pointer list-none items-center justify-between py-6 text-lg font-semibold">{question}<ChevronDown className="h-5 w-5 text-[var(--muted-ink)] transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                <p className="max-w-2xl pb-7 leading-7 text-[var(--muted-ink)]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function Closing() {
  return (
    <>
      <section className="bg-[var(--oxblood)] py-24 text-white">
        <div className="editorial-shell flex items-end justify-between gap-12">
          <div><EditorialLabel tone="inverse">Your edition begins here</EditorialLabel><h2 className="mt-7 max-w-4xl font-editorial text-7xl font-medium leading-[0.9]">Dress with a clearer point of view.</h2></div>
          <Link href="/diagnosis" className="inline-flex min-h-14 shrink-0 items-center gap-3 border border-white px-7 font-semibold transition-colors hover:bg-white hover:text-[var(--oxblood)]">Begin diagnosis <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </section>
      <footer className="bg-[var(--ink)] py-8 text-[#b8afa4]"><div className="editorial-shell flex justify-between text-xs uppercase tracking-[0.16em]"><p>© 2026 Style Studio</p><p>Personal style, considered</p></div></footer>
    </>
  );
}

export function EditorialHome() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <SiteHeader actionHref="/diagnosis" actionLabel="Begin diagnosis" />
      <main><Hero /><Process /><SampleReport /><ProofAndFAQ /><Closing /></main>
    </div>
  );
}
