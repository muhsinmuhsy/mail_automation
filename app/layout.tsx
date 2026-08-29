import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mail Automation",
  description: "Automated email campaign manager",
};

const hydrationExtensionCleanup = `
(function () {
  var extensionAttributePrefixes = ['bis_', '__processed_'];

  function isExtensionAttribute(name) {
    return extensionAttributePrefixes.some(function (prefix) {
      return name.indexOf(prefix) === 0;
    });
  }

  function cleanupExtensionAttributes(root) {
    if (!root || !root.querySelectorAll) return;

    var elements = [document.documentElement].concat(
      Array.prototype.slice.call(root.querySelectorAll('*'))
    );

    elements.forEach(function (element) {
      Array.prototype.slice.call(element.attributes || []).forEach(function (attribute) {
        if (isExtensionAttribute(attribute.name)) {
          element.removeAttribute(attribute.name);
        }
      });
    });
  }

  var originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (typeof name === 'string' && isExtensionAttribute(name)) return;
    return originalSetAttribute.call(this, name, value);
  };

  cleanupExtensionAttributes(document);

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === 'attributes' && isExtensionAttribute(mutation.attributeName || '')) {
        mutation.target.removeAttribute(mutation.attributeName);
      }
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    subtree: true
  });

  setTimeout(function () {
    cleanupExtensionAttributes(document);
    observer.disconnect();
    Element.prototype.setAttribute = originalSetAttribute;
  }, 5000);
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-background text-text-primary"
        suppressHydrationWarning
      >
        <Script
          id="hydration-extension-cleanup"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: hydrationExtensionCleanup }}
        />
        {children}
      </body>
    </html>
  );
}
