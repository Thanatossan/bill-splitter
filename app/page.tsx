export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-8 text-center">
      <p className="text-5xl">🧾</p>
      <h1 className="text-2xl font-bold">Split the bill</h1>
      <p className="text-stone-600">
        Open the link your host shared to pick what you ate and drank. Hosts create a bill with{" "}
        <code className="rounded bg-stone-200 px-1.5 py-0.5 text-sm">npm run seed</code>.
      </p>
    </main>
  );
}
