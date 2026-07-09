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
      "Sprint 2 uses a deterministic mock engine to demonstrate the recommendation flow. Real AI integration is planned for a future sprint.",
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
    <header className="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-black/80 backdrop-blur">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Sparkles size={18} />
          </span>
          AI Personal Style Studio
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          className="md:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-4 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block w-full text-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
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
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-black dark:to-gray-800" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          Discover Your Signature Style
        </h1>
        <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-10">
          Upload 3 photos, share a few details, and get a personalized style recommendation in seconds.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/diagnosis"
            className="px-8 py-3 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20"
          >
            Start Diagnosis
          </Link>
          <Link
            href="#how-it-works"
            className="px-8 py-3 rounded-full border border-gray-300 dark:border-gray-700 font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition"
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Three simple steps to your personalized style report.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative p-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
              <span className="absolute top-6 right-6 text-4xl font-bold text-gray-100 dark:text-gray-800">
                {step.number}
              </span>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                <step.icon size={24} />
              </div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-gray-600 dark:text-gray-400">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatYouGet() {
  return (
    <section className="py-20 md:py-28 bg-gray-50 dark:bg-gray-900/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Your Personalized Style Report</h2>
          <p className="text-gray-600 dark:text-gray-300">
            A clear, actionable recommendation based on your profile.
          </p>
        </div>

        <div className="max-w-2xl mx-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Recommended style</p>
              <h3 className="text-2xl font-bold">Clean Casual / 干净休闲</h3>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <p className="text-gray-700 dark:text-gray-300">
              A relaxed but polished everyday look that keeps silhouettes simple and fabrics breathable.
            </p>

            <div className="flex gap-3">
              <Shirt className="shrink-0 text-blue-600" size={20} />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Start with a well-fitting crew-neck tee or oxford shirt, paired with tapered chinos or dark denim.
              </p>
            </div>

            <div className="flex gap-3">
              <Footprints className="shrink-0 text-blue-600" size={20} />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Clean white leather sneakers or minimalist loafers ground the outfit without looking too formal.
              </p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3" id="color-palette-label">
              <Palette size={18} className="text-blue-600" aria-hidden="true" />
              <span className="font-medium">Color palette</span>
            </div>
            <ul className="flex flex-wrap gap-2" aria-labelledby="color-palette-label">
              {colorPalette.map((color) => (
                <li
                  key={color}
                  className="px-3 py-1 rounded-full text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                >
                  {color}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3" id="avoid-label">
              <AlertCircle size={18} className="text-red-500" aria-hidden="true" />
              <span className="font-medium">Avoid</span>
            </div>
            <ul className="flex flex-wrap gap-2" aria-labelledby="avoid-label">
              {avoidTips.map((tip) => (
                <li
                  key={tip}
                  className="px-3 py-1 rounded-full text-sm border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Your Privacy Matters</h2>
          <p className="text-gray-600 dark:text-gray-300">
            We designed this experience with your data safety in mind.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {privacyPoints.map((point) => (
            <div
              key={point.text}
              className="flex flex-col items-center text-center p-6 rounded-2xl border border-gray-200 dark:border-gray-800"
            >
              <div className="mb-4 h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
                <point.icon size={24} />
              </div>
              <p className="font-medium">{point.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section id="faq" className="py-20 md:py-28 bg-gray-50 dark:bg-gray-900/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black open:ring-1 open:ring-blue-600/20"
            >
              <summary className="flex cursor-pointer items-center justify-between p-5 font-medium list-none">
                {faq.question}
                <span className="ml-4 transition-transform group-open:rotate-180">
                  <ChevronDown size={20} />
                </span>
              </summary>
              <div className="px-5 pb-5 text-gray-600 dark:text-gray-300">{faq.answer}</div>
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
        <div className="rounded-3xl bg-gradient-to-r from-blue-600 to-purple-600 p-10 md:p-16 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to find your style?</h2>
          <p className="text-blue-100 mb-8 max-w-xl mx-auto">
            Get your personalized recommendation in seconds. No login required.
          </p>
          <Link
            href="/diagnosis"
            className="inline-block px-8 py-3 rounded-full bg-white text-blue-600 font-semibold hover:bg-blue-50 transition"
          >
            Start Your Diagnosis
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          © 2026 AI Personal Style Studio
        </p>
        <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-400">
          <Link href="#" className="hover:text-gray-900 dark:hover:text-gray-200">Privacy</Link>
          <Link href="#" className="hover:text-gray-900 dark:hover:text-gray-200">Terms</Link>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <>
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
    </>
  );
}
