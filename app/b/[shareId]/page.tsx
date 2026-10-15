import { Suspense } from "react";
import FriendApp from "./FriendApp";

export default function BillPage({ params }: PageProps<"/b/[shareId]">) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-stone-500">Loading…</p>}>
      {params.then(({ shareId }) => (
        <FriendApp shareId={shareId} />
      ))}
    </Suspense>
  );
}
