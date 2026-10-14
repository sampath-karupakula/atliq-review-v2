// Demo roles for "Viewing as" (feature 23). Real accounts replace this in P11; the role names and nav stay.
export type Role = "ceo" | "reviewer" | "counsel";

export const ROLE_COOKIE = "atliq_role";

export type NavItem = { href: string; label: string };

export const ROLES: Record<Role, { name: string; title: string; home: string; nav: NavItem[] }> = {
  ceo: {
    name: "Karandeep",
    title: "CEO",
    home: "/dashboard",
    nav: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/contracts", label: "Contracts" },
      { href: "/deals", label: "Deals" },
      { href: "/register", label: "Register" },
    ],
  },
  reviewer: {
    name: "Bhavin",
    title: "Reviewer and deal owner",
    home: "/dashboard",
    nav: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/contracts", label: "Contracts" },
      { href: "/deals", label: "Deals" },
      { href: "/register", label: "Register" },
    ],
  },
  counsel: {
    name: "Counsel",
    title: "Read-only",
    home: "/dashboard",
    nav: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/register", label: "Register" },
    ],
  },
};

export const ROLE_ORDER: Role[] = ["ceo", "reviewer", "counsel"];

export function isRole(v: unknown): v is Role {
  return v === "ceo" || v === "reviewer" || v === "counsel";
}

export function navFor(role: Role): NavItem[] {
  return ROLES[role].nav;
}
