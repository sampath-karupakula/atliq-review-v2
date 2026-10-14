import { redirect } from "next/navigation";

// Companies live in the Contracts screen's "By company" view.
export default function CompaniesPage() {
  redirect("/contracts?view=company");
}
