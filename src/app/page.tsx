import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">AI Personal Style Studio</h1>
      <p className="mb-6 text-gray-600">Sprint 1 infrastructure is running.</p>
      <Link
        href="/upload"
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Go to Upload Test
      </Link>
    </main>
  );
}
