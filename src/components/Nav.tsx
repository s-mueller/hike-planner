"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/hikes", label: "Touren" },
  { href: "/hikes/new", label: "Neue Tour" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-b pb-4">
      <Link href="/hikes" className="text-lg font-bold">
        🥾 Hike Planner
      </Link>
      <div className="flex flex-wrap gap-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm font-medium ${
              pathname === link.href
                ? "text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
