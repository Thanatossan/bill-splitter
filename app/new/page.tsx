import type { Metadata } from "next";
import NewBillApp from "./NewBillApp";

export const metadata: Metadata = { title: "New bill · Split the bill", robots: { index: false, follow: false } };

export default function NewBillPage() {
  return <NewBillApp />;
}
