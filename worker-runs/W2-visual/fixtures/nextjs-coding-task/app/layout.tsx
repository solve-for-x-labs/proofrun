import type { ReactNode } from "react";
import { Header } from "../../components/Header";

// Root layout for the fixture app.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}
