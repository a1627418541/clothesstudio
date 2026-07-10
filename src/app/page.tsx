"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Camera,
  ClipboardList,
  Sparkles,
  Shield,
  Lock,
  Eye,
  Menu,
  X,
  ChevronDown,
  Shirt,
  Footprints,
  Palette,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

const navLinks = [
  { href: "/diagnosis", label: "Start Your Diagnosis" },
];

const steps = [
  {
    number: "01",
    icon: Camera,
    title: "Upload 3 Photos",
    description: "front face, side face, full body",
  },
  {
    number: "02",
    icon: ClipboardList,
    title: "Share Your Details",
    description: "gender, age, height, weight",
  },
  {
    number: "03",
    icon: Sparkles,
    title: "Get Your Style",
    description: "personalized recommendation with colors and tips",
  },
];

const privacyPoints = [
  {
    icon: Shield,
    text: "Photos are stored securely in Cloudflare R2",
  },
  {
    icon: Lock,
    text: "Anonymous sessions available — no login required",
  },
  {
    icon: Eye,
    text: "No data sold or shared",
  },
];

const faqs = [
  {
    question: "Do I need to create an account?",
    answer:
      "No. You can start with an anonymous session. Just note that anonymous reports are tied to your current browser session.",
  },
  {
    question: "What photos should I upload?",
    answer:
      "Upload one front-facing photo, one side-profile photo, and one full-body photo in natural light for the best results.",
  },
  {
    question: "Is this a real AI stylist?",
    answer:
      "Yes. We use a real AI engine to analyze your photos and profile, then generate personalized style recommendations.",
  },
  {
    question: "Can I see my report later?",
    answer:
      "Yes. After submission, you get a unique report link. If you are logged in or use the same anonymous session, you can return to it.",
  },
];

const colorPalette = ["navy", "white", "light gray", "camel", "olive"];
const avoidTips = ["oversized silhouettes", "neon colors", "excessive logos"];

function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#E8E2DA] bg-white/80 backdrop-blur">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg text-[#181614]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#B85C4F] text-white">
            <Sparkles size={18} />
          </span>
          AI Personal Style Studio
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2 rounded-full bg-[#B85C4F] text-white text-sm font-medium hover:bg-[#9A4A3F] transition"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          className="md:hidden p-2 rounded-md text-[#6F6A63] hover:bg-[#FAFAF8]"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="md:hidden border-t border-[#E8E2DA] bg-white px-4 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block w-full text-center px-4 py-2 rounded-full bg-[#B85C4F] text-white text-sm font-medium hover:bg-[#9A4A3F] transition"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#FFF9F7] via-[#FAFAF8] to-[#F2F0EC]" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 text-[#181614]">
          Discover Your Signature Style
        </h1>
        <p className="text-lg md:text-xl text-[#6F6A63] max-w-2xl mx-auto mb-10">
          Upload 3 photos, share a few details, and get a personalized style recommendation in seconds.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/diagnosis"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-[#B85C4F] text-white font-semibold hover:bg-[#9A4A3F] transition shadow-lg shadow-[#B85C4F]/15"
          >
            Start Diagnosis
            <ArrowRight size={18} />
          </Link>
          <Link
            href="#how-it-works"
            className="px-8 py-3 rounded-full border border-[#E8E2DA] text-[#181614] font-medium hover:bg-white transition"
          >
            How it works
          </Link>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#181614]">How It Works</h2>
          <p className="text-[#6F6A63]">
            Three simple steps to your personalized style report.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative p-6 rounded-2xl border border-[#E8E2DA] bg-white">
              <span className="absolute top-6 right-6 text-4xl font-bold text-[#F2F0EC]">
                {step.number}
              </span>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF9F7] text-[#B85C4F]">
                <step.icon size={24} />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-[#181614]">{step.title}</h3>
              <p className="text-[#6F6A63]">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatYouGet() {
  return (
    <section className="py-20 md:py-28 bg-[#F2F0EC]/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#181614]">Your Personalized Style Report</h2>
          <p className="text-[#6F6A63]">
            A clear, actionable recommendation based on your profile.
          </p>
        </div>

        <div className="max-w-2xl mx-auto rounded-2xl border border-[#E8E2DA] bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-[#B85C4F] flex items-center justify-center text-white">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="text-sm text-[#6F6A63]">Recommended style</p>
              <h3 className="text-2xl font-bold text-[#181614]">Clean Casual / 干净休闲</h3>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <p className="text-[#6F6A63]">
              A relaxed but polished everyday look that keeps silhouettes simple and fabrics breathable.
            </p>

            <div className="flex gap-3">
              <Shirt className="shrink-0 text-[#B85C4F]" size={20} />
              <p className="text-sm text-[#6F6A63]">
                Start with a well-fitting crew-neck tee or oxford shirt, paired with tapered chinos or dark denim.
              </p>
            </div>

            <div className="flex gap-3">
              <Footprints className="shrink-0 text-[#B85C4F]" size={20} />
              <p className="text-sm text-[#6F6A63]">
                Clean white leather sneakers or minimalist loafers ground the outfit without looking too formal.
              </p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3" id="color-palette-label">
              <Palette size={18} className="text-[#B85C4F]" aria-hidden="true" />
              <span className="font-medium text-[#181614]">Color palette</span>
            </div>
            <ul className="flex flex-wrap gap-2" aria-labelledby="color-palette-label">
              {colorPalette.map((color) => (
                <li
                  key={color}
                  className="px-3 py-1 rounded-full text-sm border border-[#E8E2DA] bg-[#FAFAF8] text-[#181614]"
                >
                  {color}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3" id="avoid-label">
              <AlertCircle size={18} className="text-[#C73E3E]" aria-hidden="true" />
              <span className="font-medium text-[#181614]">Avoid</span>
            </div>
            <ul className="flex flex-wrap gap-2" aria-labelledby="avoid-label">
              {avoidTips.map((tip) => (
                <li
                  key={tip}
                  className="px-3 py-1 rounded-full text-sm border border-[#C73E3E]/20 bg-[#FFF9F7] text-[#C73E3E]"
                >
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section className="py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#181614]">Your Privacy Matters</h2>
          <p className="text-[#6F6A63]">
            We designed this experience with your data safety in mind.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {privacyPoints.map((point) => (
            <div
              key={point.text}
              className="flex flex-col items-center text-center p-6 rounded-2xl border border-[#E8E2DA] bg-white"
            >
              <div className="mb-4 h-12 w-12 rounded-full bg-[#F2F0EC] flex items-center justify-center text-[#2E7D5A]">
                <point.icon size={24} />
              </div>
              <p className="font-medium text-[#181614]">{point.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section id="faq" className="py-20 md:py-28 bg-[#F2F0EC]/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#181614]">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-xl border border-[#E8E2DA] bg-white open:ring-1 open:ring-[#B85C4F]/20"
            >
              <summary className="flex cursor-pointer items-center justify-between p-5 font-medium list-none text-[#181614]">
                {faq.question}
                <span className="ml-4 transition-transform group-open:rotate-180 text-[#6F6A63]">
                  <ChevronDown size={20} />
                </span>
              </summary>
              <div className="px-5 pb-5 text-[#6F6A63]">{faq.answer}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBanner() {
  return (
    <section className="py-20 md:py-28">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-[#181614] p-10 md:p-16 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to find your style?</h2>
          <p className="text-[#E8E2DA] mb-8 max-w-xl mx-auto">
            Get your personalized recommendation in seconds. No login required.
          </p>
          <Link
            href="/diagnosis"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-[#B85C4F] text-white font-semibold hover:bg-[#9A4A3F] transition"
          >
            Start Your Diagnosis
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#E8E2DA] bg-white py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-[#6F6A63]">
          © 2026 AI Personal Style Studio
        </p>
        <div className="flex gap-6 text-sm text-[#6F6A63]">
          <Link href="#" className="hover:text-[#181614]">Privacy</Link>
          <Link href="#" className="hover:text-[#181614]">Terms</Link>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <Navigation />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <WhatYouGet />
        <Privacy />
        <FAQ />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}
