import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pgLite – PostgreSQL Admin",
  description: "Minimal full-stack PostgreSQL web admin tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Theme is set here in one place; palettes live in globals.css.
    <html lang="en" data-theme="tokyo">
      {/* Browser extensions add attributes to <body> before React loads. */}
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
