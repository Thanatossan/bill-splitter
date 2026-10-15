import type { Metadata } from "next";
import { Suspense } from "react";
import AdminApp from "./AdminApp";

export const metadata: Metadata = {
  title: "Host view · Split the bill",
  robots: { index: false, follow: false },
};

export default function AdminPage({ params }: PageProps<"/admin/[token]">) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-stone-500">Loading…</p>}>
      {params.then(({ token }) => (
        <AdminApp token={token} />
      ))}
    </Suspense>
  );
}
