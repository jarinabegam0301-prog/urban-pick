import type { Metadata } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import { SmoothScroll } from "@/components/smooth-scroll";
import "lenis/dist/lenis.css";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const themeScript = `(function(){try{var t=localStorage.getItem("urban-theme");if(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "URBAN",
  description: "Elevate your everyday. Clothing by URBAN.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
