import { notFound } from "next/navigation";
import TestPush from "./TestPush";

export const metadata = { title: "Prueba de notificaciones", robots: { index: false, follow: false } };

// Solo en desarrollo (npm run dev): en producción es un 404.
export default function TestPushPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <TestPush />;
}
