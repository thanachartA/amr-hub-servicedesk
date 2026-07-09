import "./globals.css";
import RegisterSW from "../components/RegisterSW";

export const metadata = {
  title: "AMR Central Admin Hub — Service Desk",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Admin Hub", statusBarStyle: "default" },
};
export const viewport = { themeColor: "#16324F" };

export default function RootLayout({ children }) {
  return (<html lang="th"><body>{children}<RegisterSW/></body></html>);
}
