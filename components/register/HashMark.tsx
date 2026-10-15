"use client";

import { useEffect } from "react";

/**
 * Marks the table row named by the URL hash (/register?tab=prec#pos-3). CSS :target is not set when Next navigates
 * on the client, so a link from a report would land on the row without showing which one it is.
 */
export function HashMark() {
  useEffect(() => {
    const mark = () => {
      document.querySelectorAll("tr.hit").forEach((el) => el.classList.remove("hit"));
      const id = decodeURIComponent(window.location.hash.slice(1));
      const row = id ? document.getElementById(id) : null;
      if (row?.tagName !== "TR") return;
      row.classList.add("hit");
      row.scrollIntoView({ block: "center" });
    };
    mark();
    window.addEventListener("hashchange", mark);
    return () => window.removeEventListener("hashchange", mark);
  }, []);
  return null;
}
