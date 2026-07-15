import "./globals.css";
import RegisterSW from "../components/RegisterSW";
import NoWheelNumber from "../components/NoWheelNumber";

export const metadata = {
  title: "AMR Central Admin Hub — Service Desk",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "AMR Hub", statusBarStyle: "default" },
};
export const viewport = { themeColor: "#202028" };

export default function RootLayout({ children }) {
  return (<html lang="th"><body>{children}<RegisterSW/><NoWheelNumber/></body></html>);
}
